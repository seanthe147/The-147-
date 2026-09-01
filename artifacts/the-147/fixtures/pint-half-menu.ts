import type { MenuCategory } from "../types/menu.ts";

export const pintHalfMenuFixture: MenuCategory[] = [
  {
    id: "draught",
    name: "Draught",
    items: [
      {
        id: "square-item-lager",
        variationId: "square-variation-half",
        name: "House Lager",
        variationName: "Half",
        description: "Fresh draught lager",
        price: 250,
      },
      {
        id: "square-item-lager",
        variationId: "square-variation-pint",
        name: "House Lager",
        variationName: "Pint",
        description: "Fresh draught lager",
        price: 500,
        modifiers: [
          {
            id: "square-modifier-list-shandy",
            name: "Make it a shandy",
            selectionType: "SINGLE",
            minSelections: 0,
            maxSelections: 1,
            options: [
              {
                id: "square-modifier-lemonade",
                name: "Add lemonade",
                price: 25,
              },
            ],
          },
        ],
      },
    ],
  },
];