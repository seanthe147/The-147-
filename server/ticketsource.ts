interface TicketSourceEvent {
  id: string;
  type: string;
  attributes: {
    name: string;
    description: string;
    status?: string;
    archived: boolean;
    activated: boolean;
    url?: string;
    images?: { type: string; src: string }[];
  };
  links: {
    self: string;
    dates: string;
  };
}

interface TicketSourceDate {
  id: string;
  type: string;
  attributes: {
    start: string;
    end: string | null;
    on_sale: boolean;
    cancelled: boolean;
    public: boolean;
  };
  links: {
    book_now?: string;
    self?: string;
  };
}

export interface AppEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  endDate: string | null;
  endTime: string | null;
  status: string;
  isSoldOut: boolean;
  ticketUrl: string;
  imageUrl: string | null;
  capacity: number | null;
  availableCapacity: number | null;
}

let cachedEvents: AppEvent[] = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000;

function parseIso(iso: string): { date: string; time: string } {
  // "2026-10-03T18:00:00+00:00" → date="2026-10-03", time="18:00"
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

export async function fetchTicketSourceEvents(): Promise<AppEvent[]> {
  const now = Date.now();
  if (cachedEvents.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedEvents;
  }

  const apiKey = process.env.TICKETSOURCE_API_KEY;
  if (!apiKey) {
    console.log("TICKETSOURCE_API_KEY not set, returning cached/empty events");
    return cachedEvents;
  }

  try {
    const eventsRes = await fetch("https://api.ticketsource.io/events?per_page=100", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!eventsRes.ok) {
      console.error("TicketSource events fetch failed:", eventsRes.status, await eventsRes.text());
      return cachedEvents;
    }

    const eventsData = await eventsRes.json();
    const tsEvents: TicketSourceEvent[] = eventsData.data || [];

    const allAppEvents: AppEvent[] = [];

    for (const event of tsEvents) {
      if (event.attributes.archived) continue;
      if (!event.attributes.activated) continue;

      const imageUrl = event.attributes.images?.find(i => i.type === "banner")?.src
        ?? event.attributes.images?.[0]?.src
        ?? null;

      try {
        const datesRes = await fetch(
          `https://api.ticketsource.io/events/${event.id}/dates?per_page=100`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (!datesRes.ok) continue;

        const datesData = await datesRes.json();
        const dates: TicketSourceDate[] = datesData.data || [];

        // Filter out cancelled/non-public dates
        const activeDates = dates.filter(d => !d.attributes.cancelled && d.attributes.public);

        if (activeDates.length === 0) {
          // Event with no upcoming dates — skip (or include with no date)
          allAppEvents.push({
            id: event.id,
            title: event.attributes.name,
            description: event.attributes.description || "",
            date: "",
            time: "",
            endDate: null,
            endTime: null,
            status: "on_sale",
            isSoldOut: false,
            ticketUrl: `https://www.ticketsource.com/the147`,
            imageUrl,
            capacity: null,
            availableCapacity: null,
          });
        } else {
          for (const d of activeDates) {
            const { date, time } = parseIso(d.attributes.start);
            const endParsed = d.attributes.end ? parseIso(d.attributes.end) : null;
            const bookUrl = d.links?.book_now || `https://www.ticketsource.com/the147`;

            allAppEvents.push({
              id: `${event.id}_${d.id}`,
              title: event.attributes.name,
              description: event.attributes.description || "",
              date,
              time,
              endDate: endParsed?.date ?? null,
              endTime: endParsed?.time ?? null,
              status: d.attributes.on_sale ? "on_sale" : "sold_out",
              isSoldOut: !d.attributes.on_sale,
              ticketUrl: bookUrl,
              imageUrl,
              capacity: null,
              availableCapacity: null,
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching dates for event ${event.id}:`, err);
      }
    }

    allAppEvents.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });

    cachedEvents = allAppEvents;
    lastFetchTime = now;
    console.log(`TicketSource: fetched ${allAppEvents.length} event dates from ${tsEvents.length} events`);
    return allAppEvents;
  } catch (err) {
    console.error("TicketSource fetch error:", err);
    return cachedEvents;
  }
}

export function clearEventCache() {
  cachedEvents = [];
  lastFetchTime = 0;
}
