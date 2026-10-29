export const MISSION_AD_ZONE = "12144051";
export const MISSION_AD_SCRIPT = "https://al5sm.com/tag.min.js";
const tagId = "devil-mission-onclick";

// Called only after authentication, plan selection and the initial flow response.
// No synthetic clicks, popup overrides, retries or custom frequency settings.
export function loadMissionAds() {
  if (typeof document === "undefined" || window.location.pathname !== "/") return false;
  if (document.getElementById(tagId)) return true;
  try {
    const script = document.createElement("script");
    script.id = tagId;
    script.dataset.zone = MISSION_AD_ZONE;
    script.src = MISSION_AD_SCRIPT;
    script.async = true;
    (document.body || document.documentElement).appendChild(script);
    return true;
  } catch { return false; } // Ad loading must never block missions or key issuance.
}
