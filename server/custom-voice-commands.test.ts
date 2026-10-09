import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { interpretVoiceInstruction, resolveCustomVoiceInstruction } from "../client/src/lib/customVoiceCommands";

const projectRoot = resolve(import.meta.dirname, "..");

describe("الأوامر الصوتية المخصصة", () => {
  it("يحفظ الجملة المخصصة ويربطها بإجراء ويشغلها من الميكروفون العام", () => {
    const commands = readFileSync(resolve(projectRoot, "client/src/lib/customVoiceCommands.ts"), "utf8");
    const assistant = readFileSync(resolve(projectRoot, "client/src/pages/VoiceAssistant.tsx"), "utf8");
    const handler = readFileSync(resolve(projectRoot, "client/src/components/VoiceCommandHandler.tsx"), "utf8");

    expect(commands).toContain("VOICE_COMMAND_ACTIONS");
    expect(commands).toContain("findCustomVoiceCommand");
    expect(assistant).toContain("أوامري الصوتية المخصصة");
    expect(assistant).toContain("saveCustomCommand");
    expect(assistant).toContain("editCustomCommand");
    expect(assistant).toContain("deleteCustomCommand");
    expect(handler).toContain("findCustomVoiceCommand(rawText, customCommands)");
  });

  it("يفهم جمل الفواتير والبحث والرجوع من النص نفسه", () => {
    expect(interpretVoiceInstruction("افتح صفحة الفواتير")).toMatchObject({ kind: "navigate", route: "/invoice-camera" });
    expect(interpretVoiceInstruction("ابحث عن منتج اوكسي")).toMatchObject({ kind: "search", route: expect.stringContaining("type=products") });
    expect(interpretVoiceInstruction("ابحث عن تركيبة صابون")).toMatchObject({ kind: "search", route: expect.stringContaining("type=recipes") });
    expect(interpretVoiceInstruction("ارجع للقائمة السابقة")).toMatchObject({ kind: "back" });
    expect(resolveCustomVoiceInstruction({ id: "old", phrase: "افتح صفحة الفواتير", action: "open_products", createdAt: "now" })).toMatchObject({ route: "/invoice-camera" });
  });
});
