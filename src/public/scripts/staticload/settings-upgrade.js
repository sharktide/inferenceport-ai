const PLAN_DISPLAY_NAMES = {
    free: "Free Tier",
    light: "InferencePort AI Light",
    pro: "InferencePort AI Pro",
    creator: "InferencePort AI Creator",
    professional: "InferencePort AI Professional",
};
const PLAN_LIMITS = {
    free: {
        "Lightning Chat": "50 Today",
        "Images": "10 Today",
        "Videos": "3 Today",
        "Audio": "1 Weekly",
    },
    light: {
        CloudChatsPerDay: null,
        ImagesPerDay: 50,
        VideosPerDay: 10,
        AudioPerWeek: 5,
    },
    pro: {
        CloudChatsPerDay: null,
        ImagesPerDay: 150,
        VideosPerDay: null,
        AudioPerWeek: 25,
    },
    creator: {
        CloudChatsPerDay: null,
        ImagesPerDay: 300,
        VideosPerDay: 50,
        AudioPerWeek: 45,
    },
    professional: {
        CloudChatsPerDay: null,
        ImagesPerDay: null,
        VideosPerDay: null,
        AudioPerWeek: 75,
    },
};
window.addEventListener("DOMContentLoaded", async () => {
    const upgradeBtn = document.getElementById("settings-upgrade-btn");
    const upgradeSection = document.getElementById("upgrade-section");
    const upgradePlanInfo = document.getElementById("upgrade-plan-info");
    let modal;

    const planKey = window.auth?.getSession ? ((await window.auth.getSession())?.subscription?.planName?.toLowerCase() || "free") : "free";
    const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS["free"];
    let limitsHtml = `<div style='margin-bottom:12px;'><strong>Rate Limits Remaining:</strong><ul style='margin:8px 0 0 16px;'>`;
    for (const [key, val] of Object.entries(limits)) {
        limitsHtml += `<li>${key.replace(/([A-Z])/g, ' $1')}: ${val === null ? "Unlimited" : val}</li>`;
    }
    limitsHtml += `</ul></div>`;
    upgradePlanInfo.insertAdjacentHTML("afterend", limitsHtml);

    upgradeBtn.onclick = async () => {
        if (!modal && window.ic && window.ic.iModal) {
            modal = new window.ic.iModal("settings-upgrade-modal", 700, undefined, false, false);
        }
        let plansHtml = `<h2>Upgrade Your Plan</h2><p>Choose a plan to unlock more features and higher limits.</p><div style='display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,auto);gap:12px;max-height:300px;overflow:auto;'>`;
        for (const [key, name] of Object.entries(PLAN_DISPLAY_NAMES)) {
            const planLimits = PLAN_LIMITS[key];
            plansHtml += `<div style='border:1px solid rgba(127,127,127,0.25);border-radius:10px;padding:10px;display:grid;gap:4px;'>`;
            plansHtml += `<h4 style='margin:0 0 6px 0;'>${name}</h4><ul style='margin:0 0 6px 16px;'>`;
            for (const [limitKey, limitVal] of Object.entries(planLimits)) {
                plansHtml += `<li>${limitKey.replace(/([A-Z])/g, ' $1')}: ${limitVal === null ? "Unlimited¹" : limitVal}</li>`;
            }
            plansHtml += `</ul>`;
            if (window.auth?.getSession && (await window.auth.getSession())?.session?.isAuthenticated) {
                plansHtml += `<button type='button' style='margin-top:6px' onclick='window.location.href="settings.html#upgrade"'>Switch to ${name}</button>`;
            } else {
                plansHtml += `<button type='button' style='margin-top:6px' disabled>Sign in to upgrade</button>`;
            }
            plansHtml += `</div>`;
        }
        plansHtml += `</div>`;
                    plansHtml += `<br><p><small>¹ Per-minute rate limits may still apply.</small></p>`;

        modal.open({ html: plansHtml });
    };
});
