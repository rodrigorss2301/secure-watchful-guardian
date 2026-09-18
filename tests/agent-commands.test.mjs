import assert from "node:assert/strict";
import test from "node:test";
import { claimPendingCommands, recordCommandResult } from "../src/lib/agent-commands.server.ts";

// In-memory query double: filters are evaluated at write time, like conditional UPDATE.
function database(rows, options = {}) {
  let writes = 0;
  const selectedColumns = [];
  return {
    get writes() {
      return writes;
    },
    get selectedColumns() {
      return selectedColumns;
    },
    from() {
      let changes;
      const filters = [];
      let single = false;
      let limit = Infinity;
      const query = {
        select(columns) {
          if (typeof columns === "string") selectedColumns.push(columns);
          return query;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return query;
        },
        in(key, values) {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        order() {
          return query;
        },
        limit(value) {
          limit = value;
          return query;
        },
        update(value) {
          changes = value;
          return query;
        },
        maybeSingle() {
          single = true;
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              if (options.readError || (changes && options.writeError)) {
                return { data: null, error: new Error("database unavailable") };
              }
              if (changes) options.beforeWrite?.(rows);
              const matches = rows
                .filter((row) => filters.every((filter) => filter(row)))
                .slice(0, limit);
              if (changes) {
                writes++;
                matches.forEach((row) => Object.assign(row, changes));
              }
              const data = matches.map((row) => ({ ...row }));
              return { data: single ? (data[0] ?? null) : data, error: null };
            })
            .then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const command = (overrides = {}) => ({
  id: "command-1",
  endpoint_id: "endpoint-1",
  status: "sent",
  expires_at: "2099-01-01T00:00:00Z",
  output: null,
  failed_reason: null,
  ...overrides,
});
const result = { command_id: "command-1", status: "succeeded", output: "OK" };

test("records a sent command and acknowledges exact retries without rewriting", async () => {
  const row = command();
  const db = database([row]);
  assert.equal((await recordCommandResult(db, "endpoint-1", result)).status, 200);
  const completedAt = row.completed_at;
  row.expires_at = "2000-01-01T00:00:00Z";
  assert.equal((await recordCommandResult(db, "endpoint-1", result)).status, 200);
  assert.equal(db.writes, 1);
  assert.equal(row.completed_at, completedAt);
});

for (const status of ["pending", "cancelled", "expired", "succeeded", "failed", "timeout"]) {
  test(`does not overwrite ${status} commands`, async () => {
    const db = database([command({ status })]);
    assert.equal((await recordCommandResult(db, "endpoint-1", result)).status, 409);
    assert.equal(db.writes, 0);
  });
}

test("rejects results for another endpoint", async () => {
  const db = database([command()]);
  assert.equal((await recordCommandResult(db, "another-endpoint", result)).status, 404);
  assert.equal(db.writes, 0);
});

test("expires a sent command instead of accepting a late result", async () => {
  const row = command({ expires_at: "2000-01-01T00:00:00Z" });
  assert.equal((await recordCommandResult(database([row]), "endpoint-1", result)).status, 410);
  assert.equal(row.status, "expired");
  assert.equal(row.output, null);
});

test("concurrent cancellation wins over a stale result", async () => {
  const row = command();
  const db = database([row], {
    beforeWrite: () => {
      row.status = "cancelled";
    },
  });
  assert.equal((await recordCommandResult(db, "endpoint-1", result)).status, 409);
  assert.equal(row.status, "cancelled");
});

test("concurrent heartbeats claim a command only once", async () => {
  const db = database([command({ status: "pending" })]);
  const deliveries = await Promise.all([
    claimPendingCommands(db, "endpoint-1"),
    claimPendingCommands(db, "endpoint-1"),
  ]);
  assert.equal(deliveries.flat().length, 1);
});

test("dispatch excludes expired, cancelled and foreign commands", async () => {
  const expired = command({ status: "pending", expires_at: "2000-01-01T00:00:00Z" });
  const db = database([
    expired,
    command({ status: "cancelled" }),
    command({ status: "pending", endpoint_id: "other" }),
  ]);
  assert.deepEqual(await claimPendingCommands(db, "endpoint-1"), []);
  assert.equal(expired.status, "expired");
});

test("cancellation during dispatch prevents delivery", async () => {
  const row = command({ status: "pending" });
  const db = database([row], {
    beforeWrite: () => {
      row.status = "cancelled";
    },
  });
  assert.deepEqual(await claimPendingCommands(db, "endpoint-1"), []);
});

test("database failures never acknowledge results or deliver commands", async () => {
  for (const options of [{ readError: true }, { writeError: true }]) {
    assert.equal(
      (await recordCommandResult(database([command()], options), "endpoint-1", result)).status,
      500,
    );
    await assert.rejects(
      claimPendingCommands(database([command({ status: "pending" })], options), "endpoint-1"),
    );
  }
});

// O agente calcula o HMAC sobre signed_payload, o texto exato que o banco
// assinou. Se a coluna parar de ser selecionada o agente rejeita TODO comando
// (fail-closed), entao a frota fica muda sem erro visivel.
test("dispatched commands carry the signed payload the agent verifies", async () => {
  const row = command({
    status: "pending",
    signature: "a".repeat(64),
    signed_payload: 'command-1|shutdown|{"delay_seconds": 30, "message": ""}|300',
  });
  const db = database([row]);
  const [dispatched] = await claimPendingCommands(db, "endpoint-1");

  assert.ok(
    db.selectedColumns.every((columns) => columns.includes("signed_payload")),
    "claimPendingCommands precisa selecionar signed_payload",
  );
  assert.equal(dispatched.signed_payload, row.signed_payload);
  assert.equal(dispatched.signature, row.signature);
});
