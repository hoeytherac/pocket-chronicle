globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  },
  utils: { getProperty: () => undefined }
};
globalThis.CONST = { KEYBINDING_PRECEDENCE: { NORMAL: 0 } };
globalThis.Hooks = { once: () => undefined, on: () => undefined };

await import("../scripts/pocket-chronicle.js");
console.log("Pocket Chronicle entry module imported successfully with Foundry globals mocked.");
