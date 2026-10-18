import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc";
import { invokeLLM } from "./llm";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  generateOfferBannerTitle: protectedProcedure
    .input(z.object({ offerTitle: z.string().min(1).max(180), strategy: z.string().max(180).optional(), description: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      let response;
      try {
        response = await invokeLLM({
        model: "gemini-3-flash-preview",
        maxTokens: 120,
        messages: [
          { role: "system", content: "اكتب عنوان بانر تسويقي واحد فقط باللهجة المصرية، جذاب وقصير (من 4 إلى 10 كلمات)، بلا علامات اقتباس أو شرح، ويناسب عرض منظفات أو عطور." },
          { role: "user", content: `العرض: ${input.offerTitle}\nالاستراتيجية: ${input.strategy || "عرض توفير"}\nالوصف: ${input.description || ""}` },
        ],
        });
      } catch {
        throw new Error("تعذر توليد عنوان البانر الآن، حاول مرة أخرى.");
      }
      const content = response.choices[0]?.message.content;
      const title = (typeof content === "string" ? content : "").replace(/["«»]/g, "").trim().split("\n")[0].slice(0, 140);
      if (!title) throw new Error("تعذر توليد عنوان البانر الآن");
      return { title };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
