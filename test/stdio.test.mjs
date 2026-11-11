import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const mock = fileURLToPath(new URL("./mock-api.mjs", import.meta.url));
const credentials = { FLDTECH_LOGIN: "demo+login", FLDTECH_PASSWORD: "demo & secret=#" };

async function connect(t, env = {}) {
  const client = new Client({ name: "fldtech-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", mock, entry],
    env: { ...credentials, ...env },
  });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}

test("discovers all five read-only tools and exercises each endpoint over stdio", async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "fldtech_get_machine",
    "fldtech_get_machine_info",
    "fldtech_get_stocks",
    "fldtech_list_machines",
    "fldtech_list_products",
  ]);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.ok(tool.outputSchema);
    assert.equal(tool.inputSchema.properties?.password, undefined);
  }

  const { machines } = await call(client, "fldtech_list_machines");
  assert.deepEqual(machines.map(({ idMachine }) => idMachine), ["42", "84"]);
  const [north, west] = machines;
  const { machine } = await call(client, "fldtech_get_machine", { machine_id: Number(north.idMachine) });
  assert.deepEqual(machine, north);
  const northInfo = (await call(client, "fldtech_get_machine_info", { machine_id: north.idMachine })).machine;
  assert.equal(northInfo.fuseau_horaire, "Europe/Paris");
  assert.equal(northInfo.photo, null);
  assert.equal(northInfo.paypal_api_secret, undefined);
  assert.equal(northInfo.braintree_api_cle_privee, undefined);
  assert.equal(northInfo.stripe_account_id, undefined);
  assert.deepEqual((await call(client, "fldtech_get_machine_info")).machine, northInfo);

  const westInfo = (await call(client, "fldtech_get_machine_info", { machine_id: west.idMachine })).machine;
  assert.equal(westInfo.adresse_2, "London");
  assert.equal(westInfo.fuseau_horaire, "Europe/London");
  assert.equal(westInfo.out_of_order, 1);
  assert.equal(westInfo.iso_code_devise, "gbp");

  const { products } = await call(client, "fldtech_list_products", { machine_id: north.idMachine, language: "fr" });
  const westProducts = (await call(client, "fldtech_list_products", { machine_id: west.idMachine, language: "fr" })).products;
  assert.equal(products.find(({ nom }) => nom === "Margherita").prix_chaud, "10.00");
  assert.equal(westProducts.find(({ nom }) => nom === "Margherita").prix_chaud, "9.50");
  assert.equal(products.find(({ idProduit }) => idProduit === "102").nom, "Garden Pizza");
  assert.deepEqual(products.find(({ idProduit }) => idProduit === "101").allergenes, ["milk", "wheat"]);

  const time = "2099-01-01 19:00:00";
  const { stocks: [stocks] } = await call(client, "fldtech_get_stocks", { machine_id: north.idMachine, local_date_time: time });
  assert.deepEqual(stocks.pizza["102"], { idProduit: "102", stock: 3, promo: 2 });
  assert.equal(stocks.pizza["101"].stock, 7);
  assert.equal(stocks.boisson["201"].stock, 8);
  assert.deepEqual(await call(client, "fldtech_get_stocks", { machine_id: west.idMachine, local_date_time: time }), { stocks: [] });
});

test("selects preproduction and returns useful errors without leaking response bodies", async (t) => {
  const client = await connect(t, { FLDTECH_ENVIRONMENT: "preproduction" });
  assert.equal((await call(client, "fldtech_list_machines")).machines.length, 2);

  const cases = [
    ["fldtech_get_machine", { machine_id: 401 }, /denied access \(HTTP 401\)/],
    ["fldtech_get_machine", { machine_id: 302 }, /HTTP 302/],
    ["fldtech_get_machine", { machine_id: 500 }, /invalid JSON/],
    ["fldtech_get_machine", { machine_id: 501 }, /unexpected response/],
    ["fldtech_get_machine", { machine_id: "bad" }, /machine_id/],
    ["fldtech_get_stocks", { machine_id: "42", local_date_time: "2099-02-30 19:00:00" }, /valid local date/],
    ["fldtech_get_stocks", { machine_id: "42", local_date_time: "2099-01-01 08:00:00" }, /future date and time/],
  ];
  for (const [name, args, expected] of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, expected);
    assert.ok(!result.content[0].text.includes(credentials.FLDTECH_PASSWORD));
  }
});

test("rejects missing credentials and unsupported environments at startup", () => {
  for (const [env, expected] of [
    [{}, /Set FLDTECH_LOGIN and FLDTECH_PASSWORD/],
    [{ ...credentials, FLDTECH_ENVIRONMENT: "staging" }, /must be production or preproduction/],
  ]) {
    const result = spawnSync(process.execPath, [entry], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, expected);
  }
});
