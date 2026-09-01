---
name: Native appearance chrome
description: Confirmed requirement for keeping Android navigation controls and native launch surfaces readable across app themes.
---

When the resolved app appearance changes, update both the native root-view background and Android navigation-bar button style; changing React Native content and the status bar alone is insufficient.

**Why:** Physical iPhone and Android testing failed until native root background and Android navigation-button contrast were synchronized with the resolved palette. The same device matrix then passed on both platforms.

**How to apply:** Any future theme or palette change must keep app content, status-bar style, native root background, and Android navigation controls derived from the same resolved light/dark value. Retest cold launch, OS appearance changes, relaunch persistence, and checkout/payment surfaces on both platforms.