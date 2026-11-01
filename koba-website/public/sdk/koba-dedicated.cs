using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Koba.Dedicated
{
    /// <summary>
    /// KOBA dedicated-server track, version 1.4.0.
    /// For Rust, DayZ, ARK, and 7 Days to Die hosts.
    /// This plugin does not run inside KOBAbot. It builds a normalized
    /// event on the game server and posts it to the ingest gateway.
    /// </summary>
    public sealed class KobaDedicatedPlugin
    {
        public const string Version = "1.4.0";
        readonly string gameType;
        readonly string serverId;
        readonly Func<string, string, string> post;
        float budgetMs = 8f;

        public KobaDedicatedPlugin(string gameType, string serverId, Func<string, string, string> post)
        {
            this.gameType = gameType;
            this.serverId = serverId;
            this.post = post;
        }

        /// <summary>
        /// Dynamic budget stepping. A late frame stretches the telemetry
        /// interval instead of stalling the server tick.
        /// </summary>
        public float StepBudget(float frameMs)
        {
            if (frameMs > 16f) budgetMs = Math.Min(40f, budgetMs + 2f);
            else budgetMs = Math.Max(4f, budgetMs - 1f);
            return budgetMs;
        }

        public string BuildKill(string actor, string target, string weapon, bool headshot, double meters, double fps)
        {
            var clock = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var payload = new StringBuilder(320);
            payload.Append("{\"integration_metadata\":{");
            payload.Append("\"koba_server_id\":\"").Append(Clean(serverId)).Append("\",");
            payload.Append("\"game_type\":\"").Append(Clean(gameType)).Append("\",");
            payload.Append("\"payload_timestamp_utc\":").Append(clock);
            payload.Append("},\"event_envelope\":{");
            payload.Append("\"event_type\":\"COMBAT_KILL\",");
            payload.Append("\"cryptographic_signature\":\"0xpending\",");
            payload.Append("\"fps_at_execution\":").Append(fps.ToString("0.0", CultureInfo.InvariantCulture));
            payload.Append("},\"data_payload\":{");
            payload.Append("\"actor_identity\":\"").Append(Clean(actor)).Append("\",");
            payload.Append("\"target_identity\":\"").Append(Clean(target)).Append("\",");
            payload.Append("\"weapon_used\":\"").Append(Clean(weapon)).Append("\",");
            payload.Append("\"is_headshot\":").Append(headshot ? "true" : "false").Append(",");
            payload.Append("\"combat_distance_meters\":").Append(meters.ToString("0.0", CultureInfo.InvariantCulture));
            payload.Append("}}");
            return payload.ToString();
        }

        public string Send(string json, string token)
        {
            if (string.IsNullOrEmpty(token) || token.Length > 512)
                throw new InvalidOperationException("Missing short-lived integration token.");
            return post(json, token);
        }

        static string Clean(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            var trimmed = value.Length > 64 ? value.Substring(0, 64) : value;
            var chars = new StringBuilder(trimmed.Length);
            foreach (var c in trimmed)
            {
                if (c < ' ' || c == '<' || c == '>' || c == '"' || c == '\\') continue;
                chars.Append(c);
            }
            return chars.ToString();
        }
    }

    /// <summary>
    /// WebRCON allowlist. Chat text is never forwarded as a command.
    /// </summary>
    public sealed class KobaWebRcon
    {
        static readonly HashSet<string> Allow = new HashSet<string> { "status", "players", "save" };

        public static bool Allowed(string command)
        {
            if (string.IsNullOrWhiteSpace(command) || command.Length > 48) return false;
            var head = command.Split(' ')[0];
            return Allow.Contains(head);
        }
    }
}
