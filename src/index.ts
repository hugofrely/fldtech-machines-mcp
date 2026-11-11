import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { createApi } from "./api.js";

const numericMachineId = z.union([z.int(), z.string().regex(/^-?\d+$/)])
  .describe("Machine ID from fldtech_list_machines, as an integer or an integer string.");
const machineId = z.union([z.int(), z.string().trim().min(1)])
  .describe("Machine ID from fldtech_list_machines.");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  .refine((value) => z.iso.datetime().safeParse(`${value.replace(" ", "T")}Z`).success, {
    message: "Use a valid local date and time in YYYY-MM-DD HH:mm:ss format.",
  })
  .describe("Future date and time in the machine's local time zone, as YYYY-MM-DD HH:mm:ss. Look up fuseau_horaire with fldtech_get_machine_info.");

const textField = z.string().nullish();
const numericField = z.union([z.number(), z.string()]).nullish();

const machine = z.object({
  idMachine: machineId,
  nom: textField,
  latitude: numericField,
  longitude: numericField,
});

// The upstream details response can include payment credentials. Only expose these fields.
const info = machine.extend({
  idClient: numericField,
  adresse_1: textField,
  adresse_2: textField,
  contact_numero: textField,
  contact_adresse_mail: textField,
  contact_site_web: textField,
  contact_page_facebook: textField,
  date_lancement: textField,
  photo: textField,
  type_machine: numericField,
  pizzas_max_commande: numericField,
  pourcentage_fidelite_pizz: numericField,
  pourcentage_credit_pizz: numericField,
  activer_commande_internet: numericField,
  blocage_etat: numericField,
  fuseau_horaire: textField,
  indicatif_pays: numericField,
  pays: textField,
  iso_code_pays: textField,
  iso_code_devise: textField,
  afficher_prix_ttc: numericField,
  activer_paiement_pizz: numericField,
  plages_bloquees: z.json().optional(),
  out_of_order: numericField,
  affiche_seul_prix: numericField,
  paiement_partiel: numericField,
});

const product = z.object({ idProduit: z.union([z.int(), z.string().min(1)]) }).catchall(z.json());
const stockItem = z.object({
  idProduit: z.union([z.int(), z.string().min(1)]),
  stock: z.int(),
  promo: z.int(),
});
const stockGroup = z.record(z.string(), z.record(z.string(), stockItem));
const machines = z.array(machine);
const products = z.array(product);
const stocks = z.array(stockGroup);

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function result(data: Record<string, unknown>) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function createServer(api: ReturnType<typeof createApi>) {
  const server = new McpServer({ name: "fldtech-machines-mcp", version: "0.1.0" });

  server.registerTool("fldtech_list_machines", {
    title: "List FLDTECH machines",
    description: "List the FLDTECH account's machines with IDs, names and coordinates. Start here to find a machine ID.",
    inputSchema: z.strictObject({}),
    outputSchema: z.object({ machines }),
    annotations,
  }, async (_args, ctx) => result({
    machines: await api("machines", {}, machines, ctx.mcpReq.signal),
  }));

  server.registerTool("fldtech_get_machine", {
    title: "Get FLDTECH machine",
    description: "Look up a machine's name and coordinates by ID. Use fldtech_get_machine_info for its address, time zone or status.",
    inputSchema: z.strictObject({ machine_id: numericMachineId }),
    outputSchema: z.object({ machine }),
    annotations,
  }, async ({ machine_id }, ctx) => result({
    machine: await api("machine", { idMachine: String(machine_id) }, machine, ctx.mcpReq.signal),
  }));

  server.registerTool("fldtech_get_machine_info", {
    title: "Get FLDTECH machine details",
    description: "Get a machine's address, contact information, time zone, status and settings. Provide a machine ID for a specific machine.",
    inputSchema: z.strictObject({ machine_id: machineId.optional() }),
    outputSchema: z.object({ machine: info }),
    annotations,
  }, async ({ machine_id }, ctx) => result({
    machine: await api("infos_machine", machine_id === undefined ? {} : { idMachine: String(machine_id) }, info, ctx.mcpReq.signal),
  }));

  server.registerTool("fldtech_list_products", {
    title: "List FLDTECH products",
    description: "List a machine's products, prices, ingredients and allergens. Use fldtech_get_stocks for availability at a future time.",
    inputSchema: z.strictObject({
      machine_id: numericMachineId,
      language: z.string().trim().min(1).describe("Language code for the product catalog, for example fr."),
    }),
    outputSchema: z.object({ products }),
    annotations,
  }, async ({ machine_id, language }, ctx) => result({
    products: await api("pizzas", { idMachine: String(machine_id), lg: language }, products, ctx.mcpReq.signal),
  }));

  server.registerTool("fldtech_get_stocks", {
    title: "Get FLDTECH stocks",
    description: "Check regular and promotional stock by product type and product ID at a future time. Use fldtech_list_products to look up product names.",
    inputSchema: z.strictObject({ machine_id: machineId, local_date_time: localDateTime }),
    outputSchema: z.object({ stocks }),
    annotations,
  }, async ({ machine_id, local_date_time }, ctx) => result({
    stocks: await api("stocks", { idMachine: String(machine_id), date_heure: local_date_time }, stocks, ctx.mcpReq.signal),
  }));

  return server;
}

try {
  const api = createApi(process.env);
  serveStdio(() => createServer(api));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not start the FLDTECH MCP server.");
  process.exitCode = 1;
}
