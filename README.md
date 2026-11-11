# FLDTECH Machines MCP

A local Model Context Protocol (MCP) server for the FLDTECH Machines API v1.1.0. It reads machine locations and settings, product catalogs, and stock availability. It runs over stdio and covers all five documented API operations.

## Install

You need Node.js 22 or newer, access to this GitHub repository, and a FLDTECH login and password enabled for the Machines API.

```sh
git clone https://github.com/hugofrely/fldtech-machines-mcp.git
cd fldtech-machines-mcp
npm ci
npm run build
```

Copy `.env.example` to `.env` in the repository and edit it with your FLDTECH credentials. Quote values that contain `#` or leading or trailing spaces. Keep this file on your machine. On macOS or Linux, use `chmod 600 .env` to limit file access to your account.

| Variable | Value |
| --- | --- |
| `FLDTECH_LOGIN` | FLDTECH Machines API login |
| `FLDTECH_PASSWORD` | FLDTECH Machines API password |
| `FLDTECH_ENVIRONMENT` | `production` (default) for `atweb.smart-pizza.fr` or `preproduction` for `preprod-atweb.smart-pizza.fr` |

The server also accepts these variables directly from its environment. The client must launch `node` with the absolute path to `dist/index.js`. Use `--env-file` to load credentials from a file as shown below.

### Codex

Replace the example paths with the absolute paths on your machine, then restart Codex.

```sh
codex mcp add fldtech-machines -- node \
  "--env-file=/absolute/path/fldtech-machines-mcp/.env" \
  "/absolute/path/fldtech-machines-mcp/dist/index.js"
codex mcp list
```

### Claude Desktop

Open **Settings → Developer → Edit Config** and add this entry under `mcpServers`. Replace the example paths with your absolute paths and restart Claude Desktop. Use the absolute path to the Node.js executable for `command` if the app cannot find `node`. On Windows, use absolute Windows paths and escape backslashes as `\\` in JSON. [Claude Desktop configuration guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

```json
{
  "mcpServers": {
    "fldtech-machines": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/fldtech-machines-mcp/.env",
        "/absolute/path/fldtech-machines-mcp/dist/index.js"
      ]
    }
  }
}
```

## Tools

| Tool | Arguments | FLDTECH endpoint |
| --- | --- | --- |
| `fldtech_list_machines` | None | `POST /webapi/machines` |
| `fldtech_get_machine` | `machine_id` | `POST /webapi/machine` |
| `fldtech_get_machine_info` | `machine_id` (optional in the API specification) | `POST /webapi/infos_machine` |
| `fldtech_list_products` | `machine_id`, `language` such as `fr` | `POST /webapi/pizzas` |
| `fldtech_get_stocks` | `machine_id`, `local_date_time` | `POST /webapi/stocks` |

All tools read data. The upstream API uses form-encoded `POST` requests for these queries. Tools return JSON with the original FLDTECH field names. Machine details omit payment-provider credentials and identifiers.

For stock checks, first look up the machine's `fuseau_horaire` with `fldtech_get_machine_info`. Pass a future time in that time zone using `YYYY-MM-DD HH:mm:ss`. FLDTECH validates whether the requested time is in the future.

Example requests you can ask in your MCP client:

- “List my FLDTECH machines with their IDs and coordinates.”
- “Find the address and time zone for machine 42.”
- “Check tomorrow's stock at 19:00 local time for machine 42 and match the product IDs to names from the French catalog.”

## Verify

Run `npm test` to compile the server and exercise all five tools over stdio with simulated FLDTECH responses. This check runs without a FLDTECH account. The [evaluation questions](test/evaluation.xml) use the same fictional machines and products. With your own credentials configured, ask your client to list the machines in your account to verify live access.

If the client cannot start the server, check that you ran `npm run build`, that both paths are absolute, and that the client can run Node.js 22 or newer. If FLDTECH denies access, check the account credentials, the selected environment, and the account's machine permissions.
