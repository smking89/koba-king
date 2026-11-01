/**
 * Artwork for the badge registry (migrations/0020_badge_sets.sql). The registry
 * only stores ids and copy, so the illustration is chosen here: one sheet was
 * sliced into `public/badges/player` (competitive tracks) and
 * `public/badges/business` (trade tracks), one file per badge id.
 *
 * Every locked badge still renders this artwork - greyed - so the collection
 * shows what is actually waiting to be earned rather than a generic placeholder.
 */
const BADGE_ART: Record<string, string> = {
  "rivalry-1": "/badges/player/rivalry-1.png",
  "rivalry-2": "/badges/player/rivalry-2.png",
  "rivalry-3": "/badges/player/rivalry-3.png",
  "rivalry-4": "/badges/player/rivalry-4.png",
  "rivalry-5": "/badges/player/rivalry-5.png",
  "competition-1": "/badges/player/competition-1.png",
  "competition-2": "/badges/player/competition-2.png",
  "competition-3": "/badges/player/competition-3.png",
  "competition-4": "/badges/player/competition-4.png",
  "competition-5": "/badges/player/competition-5.png",
  "legend-1": "/badges/player/legend-1.png",
  "legend-2": "/badges/player/legend-2.png",
  "legend-3": "/badges/player/legend-3.png",
  "legend-4": "/badges/player/legend-4.png",
  "legend-5": "/badges/player/legend-5.png",
  "merchant-1": "/badges/business/merchant-1.png",
  "merchant-2": "/badges/business/merchant-2.png",
  "merchant-3": "/badges/business/merchant-3.png",
  "merchant-4": "/badges/business/merchant-4.png",
  "merchant-5": "/badges/business/merchant-5.png",
  "operator-1": "/badges/business/operator-1.png",
  "operator-2": "/badges/business/operator-2.png",
  "operator-3": "/badges/business/operator-3.png",
  "operator-4": "/badges/business/operator-4.png",
  "operator-5": "/badges/business/operator-5.png",
  "patron-1": "/badges/business/patron-1.png",
  "patron-2": "/badges/business/patron-2.png",
  "patron-3": "/badges/business/patron-3.png",
  "patron-4": "/badges/business/patron-4.png",
  "patron-5": "/badges/business/patron-5.png",
};

const FALLBACK_ART = "/badges/player/legend-1.png";

export function badgeArt(badgeId: string): string {
  return BADGE_ART[badgeId] ?? FALLBACK_ART;
}
