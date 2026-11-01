import { API_BASE, type ApiEndpoint } from "./api-reference";

export interface Snippet {
  id: "curl" | "discord" | "python" | "go";
  label: string;
  code: string;
}

interface Header {
  name: string;
  value: string;
}

/** Substitute path params and collect query params into a real request URL. */
export function requestUrl(endpoint: ApiEndpoint, values: Record<string, string>): string {
  const path = endpoint.path.replace(/\{([a-z_]+)\}/g, (_match, name: string) => {
    const raw = values[name]?.trim() || endpoint.params.find((param) => param.name === name)?.example || "";
    return encodeURIComponent(raw);
  });
  const search = endpoint.params
    .filter((param) => param.in === "query")
    .map((param) => [param.name, values[param.name]?.trim() ?? ""] as const)
    .filter(([, value]) => value.length > 0)
    // Commas stay literal: a list like include=games,challenges is readable in
    // docs and every HTTP client sends it the same way.
    .map(([name, value]) => `${name}=${encodeURIComponent(value).replace(/%2C/g, ",")}`)
    .join("&");
  return `${API_BASE}${path}${search ? `?${search}` : ""}`;
}

export function requestBody(endpoint: ApiEndpoint): string | null {
  return endpoint.body ? JSON.stringify(endpoint.body, null, 2) : null;
}

/** Header params the caller filled in - the key itself is added separately. */
export function requestHeaders(endpoint: ApiEndpoint, values: Record<string, string>): Header[] {
  return endpoint.params
    .filter((param) => param.in === "header")
    .flatMap((param) => {
      const value = values[param.name]?.trim();
      return value ? [{ name: param.name, value }] : [];
    });
}

function curlSnippet(endpoint: ApiEndpoint, url: string, body: string | null, headers: Header[]): string {
  const parts = [`curl -s${endpoint.method === "POST" ? " -X POST" : ""} "${url}"`];
  parts.push(`-H "Authorization: Bearer $KOBA_API_KEY"`);
  for (const header of headers) parts.push(`-H "${header.name}: ${header.value}"`);
  if (body) parts.push(`-H "content-type: application/json"`, `-d '${body.replace(/\n\s*/g, "")}'`);
  return parts.map((part, index) => (index === 0 ? part : `  ${part}`)).join(" \\\n");
}

function discordSnippet(endpoint: ApiEndpoint, url: string, headers: Header[]): string {
  const extraHeaders = headers.map((header) => `\n    "${header.name}": "${header.value}",`).join("");

  if (endpoint.shape === "player") {
    return `import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("koba")
  .setDescription("Look up a KOBA player")
  .addStringOption((option) =>
    option.setName("player").setDescription("KOBAid").setRequired(true),
  );

export async function execute(interaction) {
  const kobaId = interaction.options.getString("player", true);
  const response = await fetch(
    "${url.replace(/\/koba_[a-z0-9]+/g, "/" + "${kobaId}")}",
    {
      headers: {
        Authorization: \`Bearer \${process.env.KOBA_API_KEY}\`,${extraHeaders}
      },
    },
  );

  if (!response.ok) {
    await interaction.reply({ content: \`KOBA returned \${response.status}.\`, ephemeral: true });
    return;
  }

  const player = await response.json();
  const embed = new EmbedBuilder()
    .setTitle(\`\${player.name} · @\${player.handle}\`)
    .setDescription(\`\${player.rank.label} · \${player.rank.score.toLocaleString("en-US")} KOBA score\`)
    .addFields(
      { name: "XP", value: player.totals.xp.toLocaleString("en-US"), inline: true },
      { name: "Hours", value: player.totals.hours.toFixed(1), inline: true },
      { name: "Badges", value: String(player.badges_unlocked), inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}`;
  }
  if (endpoint.shape === "collection") {
    return `import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("top")
  .setDescription("Post a KOBA leaderboard")
  .addIntegerOption((option) =>
    option.setName("count").setDescription("How many rows (max 10)").setMinValue(1).setMaxValue(10),
  );

export async function execute(interaction) {
  const count = interaction.options.getInteger("count") ?? 5;
  const response = await fetch("${url}", {
    headers: {
      Authorization: \`Bearer \${process.env.KOBA_API_KEY}\`,${extraHeaders}
    },
  });

  if (!response.ok) {
    await interaction.reply(\`KOBA returned \${response.status}.\`);
    return;
  }

  const { data } = await response.json();
  const lines = data.slice(0, count).map((row, index) => {
    const position = row.position ?? index + 1;
    return \`**\${position}.** \${row.name} · \${row.score?.toLocaleString("en-US") ?? row.title}\`;
  });

  const embed = new EmbedBuilder()
    .setTitle("KOBA leaderboard")
    .setDescription(lines.join("\\n"))
    .setFooter({ text: "Data from api.koba.games" });

  await interaction.reply({ embeds: [embed] });
}`;
  }
  if (endpoint.shape === "match") {
    return `import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("match")
  .setDescription("Post a KOBA match result")
  .addStringOption((option) =>
    option.setName("id").setDescription("Match id").setRequired(true),
  );

export async function execute(interaction) {
  const matchId = interaction.options.getString("id", true);
  const response = await fetch(
    "${url.replace(/mtc_[a-z0-9]+/, "${matchId}")}",
    {
      headers: {
        Authorization: \`Bearer \${process.env.KOBA_API_KEY}\`,${extraHeaders}
      },
    },
  );

  if (!response.ok) {
    await interaction.reply(\`No match \${matchId}.\`);
    return;
  }

  const match = await response.json();
  const embed = new EmbedBuilder()
    .setTitle(\`\${match.game} · \${match.result}\`)
    .setDescription(\`\${match.server.name} · \${match.players} players\`)
    .addFields(
      { name: "K/D", value: \`\${match.metrics.kills} / \${match.metrics.deaths}\`, inline: true },
      { name: "Score", value: \`\${match.score_delta > 0 ? "+" : ""}\${match.score_delta}\`, inline: true },
      { name: "Power rating", value: String(match.koba_power_rating), inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}`;
  }
  return `// A plain fetch works in any Discord.js v14 command.
const response = await fetch("${url}", {
  method: "${endpoint.method}",
  headers: {
    Authorization: \`Bearer \${process.env.KOBA_API_KEY}\`,
    "content-type": "application/json",${extraHeaders}
  },${endpoint.body ? `\n  body: JSON.stringify(${JSON.stringify(endpoint.body, null, 2).replace(/\n/g, "\n  ")}),` : ""}
});

if (!response.ok) throw new Error(\`KOBA returned \${response.status}\`);
const payload = await response.json();
await interaction.reply(\`\${Object.keys(payload).join(", ")}\`);`;
}

function pythonHeaders(headers: Header[]): string {
  const rows = [`    "Authorization": f"Bearer {os.environ['KOBA_API_KEY']}",`];
  for (const header of headers) rows.push(`    "${header.name}": "${header.value}",`);
  return `headers = {\n${rows.join("\n")}\n}`;
}

function pythonSnippet(endpoint: ApiEndpoint, url: string, body: string | null, headers: Header[]): string {
  const call = body
    ? `response = requests.${endpoint.method.toLowerCase()}(\n    url,\n    headers=headers,\n    json=payload,\n    timeout=10,\n)`
    : `response = requests.${endpoint.method.toLowerCase()}(url, headers=headers, timeout=10)`;
  const payloadLine = body ? `\npayload = ${body}\n` : "";
  const printLine =
    endpoint.shape === "player"
      ? `player = response.json()\nprint(f"{player['name']} · {player['rank']['label']} · {player['rank']['score']} KOBA score")`
      : endpoint.shape === "collection"
        ? `rows = response.json()["data"]\nfor row in rows:\n    print(row.get("position", "-"), row.get("name") or row.get("title"), row.get("score", ""))`
        : `print(json.dumps(response.json(), indent=2))`;

  return `import json
import os

import requests

url = "${url}"
${pythonHeaders(headers)}
${payloadLine}
${call}
response.raise_for_status()

${printLine}`;
}

function goSnippet(endpoint: ApiEndpoint, url: string, body: string | null, headers: Header[]): string {
  const goImports = [body ? "bytes" : null, "encoding/json", "fmt", "net/http", "os"]
    .filter((entry): entry is string => entry !== null)
    .map((entry) => `\t"${entry}"`)
    .join("\n");

  const bodyBlock = body
    ? `\tbody := []byte(\`${body.replace(/\n\s*/g, "")}\`)\n\tbodyReader := bytes.NewReader(body)\n`
    : "";
  const bodyArg = body ? "bodyReader" : "nil";
  const headerLines = headers.map((header) => `\n\treq.Header.Set("${header.name}", "${header.value}")`).join("");
  const decodeBlock =
    endpoint.shape === "player"
      ? `\tvar player struct {
\t\tName string \`json:"name"\`
\t\tRank struct {
\t\t\tLabel string \`json:"label"\`
\t\t\tScore int    \`json:"score"\`
\t\t} \`json:"rank"\`
\t}
\tif err := json.NewDecoder(res.Body).Decode(&player); err != nil {
\t\tpanic(err)
\t}
\tfmt.Printf("%s · %s · %d KOBA score\\n", player.Name, player.Rank.Label, player.Rank.Score)`
      : `\tvar payload map[string]any
\tif err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
\t\tpanic(err)
\t}
\tfmt.Println(payload["meta"])`;

  return `package main

import (
${goImports}
)

func main() {
${bodyBlock}	req, err := http.NewRequest(http.Method${endpoint.method === "POST" ? "Post" : "Get"}, "${url}", ${bodyArg})
	if err != nil {
		panic(err)
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("KOBA_API_KEY"))${headerLines}${body ? `\n\treq.Header.Set("content-type", "application/json")` : ""}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		panic(fmt.Sprintf("koba: %d", res.StatusCode))
	}

${decodeBlock}
}`;
}

/**
 * Every snippet reads the key from an environment variable rather than the
 * value typed into the playground: a key pasted into a source file is a key
 * that ends up in a repository.
 */
export function buildSnippets(endpoint: ApiEndpoint, values: Record<string, string>, bodyText = ""): Snippet[] {
  const url = requestUrl(endpoint, values);
  const headers = requestHeaders(endpoint, values);
  let parsed: unknown = null;
  if (bodyText.trim()) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
  }
  const body = parsed === null ? requestBody(endpoint) : JSON.stringify(parsed, null, 2);
  return [
    { id: "curl", label: "cURL", code: curlSnippet(endpoint, url, body, headers) },
    { id: "discord", label: "Discord.js", code: discordSnippet(endpoint, url, headers) },
    { id: "python", label: "Python", code: pythonSnippet(endpoint, url, body, headers) },
    { id: "go", label: "Go", code: goSnippet(endpoint, url, body, headers) },
  ];
}
