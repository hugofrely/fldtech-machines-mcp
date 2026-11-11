import assert from "node:assert/strict";

const machines = [
  { idMachine: "42", nom: "North Station", latitude: "48.86", longitude: "2.35" },
  { idMachine: "84", nom: "West Market", latitude: "51.51", longitude: "-0.13" },
];
const details = [
  { adresse_2: "Paris", fuseau_horaire: "Europe/Paris", iso_code_devise: "eur", out_of_order: 0 },
  { adresse_2: "London", fuseau_horaire: "Europe/London", iso_code_devise: "gbp", out_of_order: 1 },
];
const products = [
  [
    { idProduit: "101", nom: "Margherita", prix_chaud: "10.00", allergenes: ["milk", "wheat"] },
    { idProduit: "102", nom: "Garden Pizza", prix_chaud: "11.50", allergenes: ["wheat"] },
    { idProduit: "201", nom: "Sparkling Water", allergenes: [] },
  ],
  [{ idProduit: "101", nom: "Margherita", prix_chaud: "9.50", allergenes: ["milk", "wheat"] }],
];

globalThis.fetch = async (url, options) => {
  const endpoint = new URL(url);
  const host = process.env.FLDTECH_ENVIRONMENT === "preproduction"
    ? "https://preprod-atweb.smart-pizza.fr"
    : "https://atweb.smart-pizza.fr";
  assert.equal(endpoint.origin, host);
  assert.equal(endpoint.search, "");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "manual");
  const request = new Request(url, options);
  assert.match(request.headers.get("content-type"), /^application\/x-www-form-urlencoded/);
  const fields = await request.formData();
  assert.equal(fields.get("login"), "demo+login");
  assert.equal(fields.get("password"), "demo & secret=#");
  fields.delete("login");
  fields.delete("password");

  const id = fields.get("idMachine");
  const index = machines.findIndex((machine) => machine.idMachine === id);
  const args = [...fields.keys()].sort();
  switch (endpoint.pathname) {
    case "/webapi/machines":
      assert.deepEqual(args, []);
      return Response.json(machines);
    case "/webapi/machine":
      assert.deepEqual(args, ["idMachine"]);
      if (id === "401") return new Response("demo & secret=#", { status: 401 });
      if (id === "302") return Response.redirect("https://example.invalid");
      if (id === "500") return new Response("<html>Maintenance</html>");
      if (id === "501") return Response.json({ error: "demo & secret=#" });
      if (index < 0) return new Response(null, { status: 404 });
      return Response.json(machines[index]);
    case "/webapi/infos_machine": {
      const detailIndex = id === null ? 0 : index;
      assert.deepEqual(args, id === null ? [] : ["idMachine"]);
      if (detailIndex < 0) return new Response(null, { status: 404 });
      return Response.json({
        ...machines[detailIndex],
        idMachine: Number(machines[detailIndex].idMachine),
        ...details[detailIndex],
        photo: null,
        paypal_api_secret: "mock-payment-secret",
        braintree_api_cle_privee: "mock-private-key",
        stripe_account_id: "mock-account-id",
      });
    }
    case "/webapi/pizzas":
      assert.deepEqual(args, ["idMachine", "lg"]);
      assert.equal(fields.get("lg"), "fr");
      if (index < 0) return new Response(null, { status: 404 });
      return Response.json(products[index]);
    case "/webapi/stocks":
      assert.deepEqual(args, ["date_heure", "idMachine"]);
      if (fields.get("date_heure") === "2099-01-01 08:00:00") return new Response(null, { status: 400 });
      assert.equal(fields.get("date_heure"), "2099-01-01 19:00:00");
      if (id === "84") return Response.json([]);
      assert.equal(id, "42");
      return Response.json([{
        pizza: {
          "101": { idProduit: 101, stock: 7, promo: 0 },
          "102": { idProduit: "102", stock: 3, promo: 2 },
        },
        boisson: { "201": { idProduit: 201, stock: 8, promo: 0 } },
      }]);
    default:
      assert.fail(`Unexpected path ${endpoint.pathname}`);
  }
};
