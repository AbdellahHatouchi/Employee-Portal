import type { z } from "zod";
import { catalogueFingerprint } from "./catalogue";
import {
	type chunkInput,
	product,
	type stageCommitInput,
	type stageInput,
} from "./contracts";
import {
	all,
	canonical,
	digest,
	first,
	notOperated,
	operate,
} from "./database";

type Stage = {
	id: string;
	machine_id: string;
	version: number;
	expected_products: number;
	expected_chunks: number;
	digest: string;
	expires_at: number;
	committed_at: number | null;
};
export async function startCatalogue(
	db: D1Database,
	input: z.infer<typeof stageInput>,
) {
	const expiresAt = Date.now() + 3600000;
	return operate(
		db,
		input,
		"catalogue-start",
		input,
		[
			{
				sql: `INSERT INTO catalogue_stages(id,machine_id,version,expected_products,expected_chunks,digest,expires_at) SELECT ?,?,?,?,?,?,? WHERE ${notOperated} ON CONFLICT(id) DO NOTHING`,
				values: [
					input.snapshotId,
					input.machineId,
					input.version,
					input.expectedProducts,
					input.expectedChunks,
					input.sha256,
					expiresAt,
					input.operationId,
				],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN EXISTS(SELECT 1 FROM catalogue_stages WHERE id=? AND machine_id=? AND version=? AND expected_products=? AND expected_chunks=? AND digest=?) THEN 'staged' ELSE 'snapshot-conflict' END,'snapshotId',?,'expiresAt',(SELECT expires_at FROM catalogue_stages WHERE id=?))`,
			values: [
				input.snapshotId,
				input.machineId,
				input.version,
				input.expectedProducts,
				input.expectedChunks,
				input.sha256,
				input.snapshotId,
				input.snapshotId,
			],
		},
	);
}
export async function addCatalogueChunk(
	db: D1Database,
	input: z.infer<typeof chunkInput>,
) {
	const payload = canonical(input.products);
	const hash = await digest(payload);
	return operate(
		db,
		input,
		"catalogue-chunk",
		input,
		[
			{
				sql: `INSERT INTO catalogue_chunks(snapshot_id,chunk_index,payload,digest) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM catalogue_stages WHERE id=? AND machine_id=? AND expires_at>? AND committed_at IS NULL AND expected_chunks>?) AND ${notOperated} ON CONFLICT(snapshot_id,chunk_index) DO NOTHING`,
				values: [
					input.snapshotId,
					input.chunkIndex,
					payload,
					hash,
					input.snapshotId,
					input.machineId,
					Date.now(),
					input.chunkIndex,
					input.operationId,
				],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN EXISTS(SELECT 1 FROM catalogue_chunks c JOIN catalogue_stages s ON s.id=c.snapshot_id WHERE c.snapshot_id=? AND s.machine_id=? AND c.chunk_index=? AND c.digest=?) THEN 'stored' ELSE 'snapshot-conflict' END,'snapshotId',?,'chunkIndex',?)`,
			values: [
				input.snapshotId,
				input.machineId,
				input.chunkIndex,
				hash,
				input.snapshotId,
				input.chunkIndex,
			],
		},
	);
}
export async function commitCatalogue(
	db: D1Database,
	input: z.infer<typeof stageCommitInput>,
) {
	const stage = await first<Stage>(
		db,
		"SELECT * FROM catalogue_stages WHERE id=? AND machine_id=?",
		input.snapshotId,
		input.machineId,
	);
	if (!stage) return { result: "unknown-id" };
	const chunks = await all<{ chunk_index: number; payload: string }>(
		db,
		"SELECT chunk_index,payload FROM catalogue_chunks WHERE snapshot_id=? ORDER BY chunk_index",
		input.snapshotId,
	);
	if (
		chunks.length !== stage.expected_chunks ||
		chunks.some((c, i) => c.chunk_index !== i)
	)
		return { result: "incomplete-snapshot" };
	const products = chunks.flatMap((c) =>
		product.array().parse(JSON.parse(c.payload)),
	);
	if (
		products.length !== stage.expected_products ||
		new Set(products.map((p) => p.id)).size !== products.length
	)
		return { result: "invalid-snapshot" };
	const fingerprint = catalogueFingerprint(products);
	if (new TextEncoder().encode(fingerprint).byteLength > 1048576)
		return { result: "snapshot-too-large" };
	if ((await digest(fingerprint)) !== stage.digest)
		return { result: "digest-conflict" };
	const now = Date.now();
	const guard = `EXISTS(SELECT 1 FROM catalogue_stages WHERE id=? AND machine_id=? AND expires_at>? AND committed_at IS NULL) AND ?>(SELECT version FROM sync_state WHERE key='catalog') AND ${notOperated}`;
	const args = [
		input.snapshotId,
		input.machineId,
		now,
		stage.version,
		input.operationId,
	];
	return operate(
		db,
		input,
		"catalogue-commit",
		input,
		[
			{
				sql: "INSERT INTO sync_state(key,version,updated_at) VALUES('catalog',0,0) ON CONFLICT(key) DO NOTHING",
			},
			{
				sql: `UPDATE catalog_products SET available=0 WHERE ${guard}`,
				values: args,
			},
			// json_each avoids thousands of statements; all promotion is one atomic D1 batch.
			{
				sql: `INSERT INTO catalog_products(id,label,unit,available,version,published_at) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.label'),json_extract(j.value,'$.unit'),json_extract(j.value,'$.available'),?,? FROM catalogue_chunks c,json_each(c.payload) j WHERE c.snapshot_id=? AND ${guard} ON CONFLICT(id) DO UPDATE SET label=excluded.label,unit=excluded.unit,available=excluded.available,version=excluded.version,published_at=excluded.published_at`,
				values: [stage.version, now, input.snapshotId, ...args],
			},
			{
				sql: `UPDATE sync_state SET version=?,updated_at=?,fingerprint=? WHERE key='catalog' AND ${guard}`,
				values: [stage.version, now, fingerprint, ...args],
			},
			{
				sql: `UPDATE catalogue_stages SET committed_at=? WHERE id=? AND machine_id=? AND committed_at IS NULL AND EXISTS(SELECT 1 FROM sync_state WHERE key='catalog' AND version=? AND fingerprint=?) AND ${notOperated}`,
				values: [
					now,
					input.snapshotId,
					input.machineId,
					stage.version,
					fingerprint,
					input.operationId,
				],
			},
		],
		{
			sql: `SELECT json_object('result',CASE WHEN EXISTS(SELECT 1 FROM catalogue_stages WHERE id=? AND committed_at IS NOT NULL) THEN 'committed' WHEN (SELECT version FROM sync_state WHERE key='catalog')>? THEN 'stale' WHEN (SELECT version FROM sync_state WHERE key='catalog')=? AND (SELECT fingerprint FROM sync_state WHERE key='catalog')=? THEN 'equivalent' WHEN (SELECT expires_at FROM catalogue_stages WHERE id=?)<=? THEN 'snapshot-expired' ELSE 'version-conflict' END,'snapshotId',?,'attemptedVersion',?,'remoteVersion',(SELECT version FROM sync_state WHERE key='catalog'))`,
			values: [
				input.snapshotId,
				stage.version,
				stage.version,
				fingerprint,
				input.snapshotId,
				now,
				input.snapshotId,
				stage.version,
			],
		},
	);
}
