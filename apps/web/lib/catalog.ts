export type Sport = {
    id: string;
    name: string;
    competitions: Competition[];
  };
  
  export type Competition = {
    id: string;
    sportId: string;
    name: string;
    events: Event[];
  };
  
  export type Event = {
    id: string;
    competitionId: string;
    name: string;
    season?: string;
  };
  
  export const CATALOG: Sport[] = [
    {
      id: "football",
      name: "Fútbol",
      competitions: [
        {
          id: "fifa",
          sportId: "football",
          name: "FIFA",
          events: [
            {
              id: "world-cup-2026",
              competitionId: "fifa",
              name: "Mundial 2026",
              season: "2026",
            },
          ],
        },
      ],
    },
  ];