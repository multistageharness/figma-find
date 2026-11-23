import type { FigmaFile, FigmaNode } from "../types.js";

/*
 * Default in-memory fixture: an Airtable-style marketing-site capture
 * mirroring the figma-find spec's validation file P7gZnWH3DvPDE217ZKcBXU.
 * Consumers replace it by passing their own `file` prop.
 */

/** Node factory: fills sensible defaults so the tree below stays readable. */
const nd = (
  o: Partial<FigmaNode> & { id: string; name: string; type: string },
): FigmaNode => ({
  visible: true,
  children: [],
  characters: undefined,
  fills: [],
  annotations: [],
  ...o,
});

const IMG = { type: "IMAGE" };

export const SEED_FILE: FigmaFile = {
  key: "P7gZnWH3DvPDE217ZKcBXU",
  name: "Airtable — Marketing",
  lastModified: "2025-05-30T14:22:00Z",
  document: nd({
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [
      nd({
        id: "1:2",
        name: "Marketing Site",
        type: "CANVAS",
        children: [
          nd({
            id: "2:4",
            name: "Hero",
            type: "FRAME",
            annotations: [
              {
                label: "Above the fold — keep copy ≤ 2 lines",
                categoryId: "content",
              },
            ],
            absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 720 },
            children: [
              nd({
                id: "3:11",
                name: "Eyebrow",
                type: "TEXT",
                characters: "Now with AI",
              }),
              nd({
                id: "3:12",
                name: "Headline",
                type: "TEXT",
                characters: "Build apps fast, without the busywork",
              }),
              nd({
                id: "3:13",
                name: "Subhead",
                type: "TEXT",
                characters: "Turn your spreadsheets into real applications.",
              }),
              nd({
                id: "3:14",
                name: "Button/Primary",
                type: "INSTANCE",
                children: [
                  nd({
                    id: "3:15",
                    name: "Label",
                    type: "TEXT",
                    characters: "Start for free",
                  }),
                ],
              }),
              nd({
                id: "3:16",
                name: "Button/Secondary",
                type: "INSTANCE",
                children: [
                  nd({
                    id: "3:17",
                    name: "Label",
                    type: "TEXT",
                    characters: "Watch demo",
                  }),
                ],
              }),
              nd({
                id: "3:18",
                name: "Hero Screenshot",
                type: "RECTANGLE",
                fills: [IMG],
                absoluteBoundingBox: {
                  x: 760,
                  y: 120,
                  width: 600,
                  height: 420,
                },
              }),
            ],
          }),
          nd({
            id: "2:5",
            name: "Features",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 720, width: 1440, height: 980 },
            children: [
              nd({
                id: "4:20",
                name: "Section Title",
                type: "TEXT",
                characters: "Everything you need to ship",
              }),
              nd({
                id: "4:21",
                name: "Feature Card",
                type: "FRAME",
                children: [
                  nd({ id: "4:22", name: "Icon", type: "VECTOR" }),
                  nd({
                    id: "4:23",
                    name: "Feature Title",
                    type: "TEXT",
                    characters: "Automations",
                  }),
                  nd({
                    id: "4:24",
                    name: "Feature Body",
                    type: "TEXT",
                    characters: "Trigger actions when records change.",
                  }),
                ],
              }),
              nd({
                id: "4:25",
                name: "Feature Card",
                type: "FRAME",
                children: [
                  nd({ id: "4:26", name: "Icon", type: "VECTOR" }),
                  nd({
                    id: "4:27",
                    name: "Feature Title",
                    type: "TEXT",
                    characters: "Interfaces",
                  }),
                  nd({
                    id: "4:28",
                    name: "Feature Body",
                    type: "TEXT",
                    characters: "Design custom views for your team.",
                  }),
                ],
              }),
              nd({
                id: "4:29",
                name: "Feature Card",
                type: "FRAME",
                children: [
                  nd({ id: "4:30", name: "Icon", type: "VECTOR" }),
                  nd({
                    id: "4:31",
                    name: "Feature Title",
                    type: "TEXT",
                    characters: "AI fields",
                  }),
                  nd({
                    id: "4:32",
                    name: "Feature Body",
                    type: "TEXT",
                    characters: "Summarize and categorize automatically.",
                  }),
                ],
              }),
            ],
          }),
          nd({
            id: "2:6",
            name: "Legacy Banner",
            type: "FRAME",
            visible: false,
            children: [
              nd({
                id: "5:40",
                name: "Old Promo",
                type: "TEXT",
                characters: "Spring sale — 20% off",
              }),
            ],
          }),
        ],
      }),
      nd({
        id: "1:3",
        name: "Pricing",
        type: "CANVAS",
        children: [
          nd({
            id: "6:1",
            name: "Plan Cards",
            type: "FRAME",
            absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 560 },
            children: [
              nd({
                id: "6:2",
                name: "Plan Free",
                type: "INSTANCE",
                children: [
                  nd({
                    id: "6:3",
                    name: "Plan Name",
                    type: "TEXT",
                    characters: "Free",
                  }),
                  nd({
                    id: "6:4",
                    name: "Price",
                    type: "TEXT",
                    characters: "$0",
                  }),
                  nd({
                    id: "6:5",
                    name: "CTA",
                    type: "INSTANCE",
                    children: [
                      nd({
                        id: "6:6",
                        name: "Label",
                        type: "TEXT",
                        characters: "Get started",
                      }),
                    ],
                  }),
                ],
              }),
              nd({
                id: "6:7",
                name: "Plan Team",
                type: "INSTANCE",
                children: [
                  nd({
                    id: "6:8",
                    name: "Plan Name",
                    type: "TEXT",
                    characters: "Team",
                  }),
                  nd({
                    id: "6:9",
                    name: "Price",
                    type: "TEXT",
                    characters: "$20",
                  }),
                  nd({
                    id: "6:10",
                    name: "CTA",
                    type: "INSTANCE",
                    children: [
                      nd({
                        id: "6:11",
                        name: "Label",
                        type: "TEXT",
                        characters: "Start trial",
                      }),
                    ],
                  }),
                ],
              }),
              nd({
                id: "6:12",
                name: "Plan Business",
                type: "INSTANCE",
                children: [
                  nd({
                    id: "6:13",
                    name: "Plan Name",
                    type: "TEXT",
                    characters: "Business",
                  }),
                  nd({
                    id: "6:14",
                    name: "Price",
                    type: "TEXT",
                    characters: "$45",
                  }),
                  nd({
                    id: "6:15",
                    name: "CTA",
                    type: "INSTANCE",
                    children: [
                      nd({
                        id: "6:16",
                        name: "Label",
                        type: "TEXT",
                        characters: "Contact sales",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  }),
  comments: [
    {
      id: "c1",
      message: "Headline feels long on mobile — can we tighten it? @dana",
      user: { handle: "miles", img_url: "" },
      created_at: "2025-05-28T10:01:00Z",
      resolved_at: null,
      client_meta: { node_id: "3:12" },
      parent_id: "",
    },
    {
      id: "c2",
      message: "Agreed, trying a shorter variant now.",
      user: { handle: "dana", img_url: "" },
      created_at: "2025-05-28T11:14:00Z",
      resolved_at: null,
      client_meta: { node_id: "3:12" },
      parent_id: "c1",
    },
    {
      id: "c3",
      message:
        "Secondary button color is off-brand. @brandteam please confirm.",
      user: { handle: "dana", img_url: "" },
      created_at: "2025-05-29T09:30:00Z",
      resolved_at: "2025-05-29T16:00:00Z",
      client_meta: { node_id: "3:16" },
      parent_id: "",
    },
    {
      id: "c4",
      message: "Pricing should lead with Team, not Free.",
      user: { handle: "priya", img_url: "" },
      created_at: "2025-05-30T08:45:00Z",
      resolved_at: null,
      client_meta: { node_id: "6:1" },
      parent_id: "",
    },
  ],
  devResources: [
    {
      id: "d1",
      name: "Hero spec — Storybook",
      url: "https://storybook.airtable.dev/hero",
      node_id: "2:4",
    },
    {
      id: "d2",
      name: "Pricing card component",
      url: "https://github.com/acme/web/pricing",
      node_id: "6:1",
    },
    {
      id: "d3",
      name: "Design tokens",
      url: "https://github.com/acme/tokens",
      node_id: "0:0",
    },
  ],
};
