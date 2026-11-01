/**
 * Xbox Live sign-in needs two hops beyond normal OAuth2 that the Microsoft
 * access token alone doesn't give you: XASU (exchange the MS token for an
 * Xbox user token) then XSTS (exchange that for the token that actually
 * carries the XUID + gamertag). Plugged into `genericOAuth`'s `getUserInfo`
 * override for the "xbox" provider in server.ts.
 */

interface XstsResponse {
  Token: string;
  DisplayClaims: { xui: { uhs: string; gtg?: string; xid?: string }[] };
}

async function xboxUserToken(msAccessToken: string): Promise<string> {
  const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccessToken}` },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });
  if (!res.ok) throw new Error(`Xbox user token exchange failed (${res.status}).`);
  const data = (await res.json()) as XstsResponse;
  return data.Token;
}

async function xstsToken(userToken: string): Promise<XstsResponse> {
  const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [userToken] },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    }),
  });
  if (!res.ok) {
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { XErr?: number } | null;
      // 2148916233 = no Xbox account on this Microsoft account; 2148916238 = child account needs adult consent.
      throw new Error(`Xbox sign-in was rejected by Xbox Live (XErr ${body?.XErr ?? "unknown"}) - the Microsoft account may not have an Xbox profile set up.`);
    }
    throw new Error(`XSTS authorize failed (${res.status}).`);
  }
  return (await res.json()) as XstsResponse;
}

export async function getXboxUserInfo(tokens: { accessToken?: string }) {
  if (!tokens.accessToken) return null;
  const userToken = await xboxUserToken(tokens.accessToken);
  const xsts = await xstsToken(userToken);
  const claim = xsts.DisplayClaims.xui[0];
  if (!claim?.xid) return null;
  return {
    id: claim.xid,
    name: claim.gtg ?? `Xbox ${claim.xid}`,
    email: undefined,
    image: undefined,
    emailVerified: false,
  };
}
