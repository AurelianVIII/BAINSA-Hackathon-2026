import type { TranscriptItem } from "@/types";

/**
 * Demo lesson content: an intro biology lesson on photosynthesis and the
 * Calvin cycle. Timestamps are in seconds and roughly match a ~5 minute clip.
 */
export const transcript: TranscriptItem[] = [
  {
    id: "t1",
    start: 0,
    end: 18,
    text: "Welcome back. Today we're looking at photosynthesis — how plants convert light energy into chemical energy.",
    topic: "Overview",
  },
  {
    id: "t2",
    start: 18,
    end: 42,
    text: "Photosynthesis happens in the chloroplast, and it's split into two stages: the light-dependent reactions and the light-independent reactions.",
    topic: "Overview",
    importance: "high",
  },
  {
    id: "t3",
    start: 42,
    end: 70,
    text: "In the light-dependent reactions, chlorophyll in the thylakoid membrane absorbs sunlight and uses that energy to split water molecules.",
    topic: "Light-Dependent Reactions",
  },
  {
    id: "t4",
    start: 70,
    end: 96,
    text: "Splitting water releases oxygen as a byproduct — that's the oxygen we breathe — and generates energy carriers called ATP and NADPH.",
    topic: "Light-Dependent Reactions",
    importance: "high",
  },
  {
    id: "t5",
    start: 96,
    end: 118,
    text: "ATP and NADPH are the key products here. Think of them as portable battery packs the plant will spend in the next stage.",
    topic: "ATP and NADPH",
  },
  {
    id: "t6",
    start: 118,
    end: 146,
    text: "Now let's move to the light-independent reactions, better known as the Calvin cycle. This happens in the stroma of the chloroplast.",
    topic: "Calvin Cycle",
    importance: "high",
  },
  {
    id: "t7",
    start: 146,
    end: 172,
    text: "The Calvin cycle takes carbon dioxide from the air and, using the ATP and NADPH from before, fixes that carbon into organic molecules.",
    topic: "Calvin Cycle",
  },
  {
    id: "t8",
    start: 172,
    end: 198,
    text: "This carbon fixation step is catalyzed by an enzyme called RuBisCO — one of the most abundant enzymes on Earth.",
    topic: "Calvin Cycle",
  },
  {
    id: "t9",
    start: 198,
    end: 224,
    text: "After several turns of the cycle, the plant produces G3P, which is rearranged into glucose — the sugar the plant uses for energy and growth.",
    topic: "Glucose Production",
    importance: "high",
  },
  {
    id: "t10",
    start: 224,
    end: 250,
    text: "So to recap the flow: sunlight and water go in, oxygen and ATP/NADPH come out, then carbon dioxide plus ATP/NADPH go in and glucose comes out.",
    topic: "Overview",
  },
  {
    id: "t11",
    start: 250,
    end: 276,
    text: "Why does this matter in the real world? Photosynthesis is the foundation of almost every food chain, and it's a major reason atmospheric CO2 doesn't just keep climbing unchecked.",
    topic: "Real-World Applications",
  },
  {
    id: "t12",
    start: 276,
    end: 300,
    text: "Researchers are even studying artificial photosynthesis to produce clean fuels. We'll cover that in a future lesson. That's it for today.",
    topic: "Real-World Applications",
  },
];
