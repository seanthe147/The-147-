const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withSquareGooglePay(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    if (!app["meta-data"]) app["meta-data"] = [];
    const already = app["meta-data"].some(
      (m) => m.$?.["android:name"] === "com.google.android.gms.wallet.api.enabled"
    );
    if (!already) {
      app["meta-data"].push({
        $: {
          "android:name": "com.google.android.gms.wallet.api.enabled",
          "android:value": "true",
        },
      });
    }
    return cfg;
  });
};
