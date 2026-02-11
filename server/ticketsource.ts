interface TicketSourceEvent {
  id: string;
  type: string;
  attributes: {
    name: string;
    description: string;
    status: string;
    url: string;
    created_at: string;
    updated_at: string;
  };
}

interface TicketSourceDate {
  id: string;
  type: string;
  attributes: {
    date: string;
    time: string;
    end_date: string | null;
    end_time: string | null;
    status: string;
    is_sold_out: boolean;
    total_capacity: number | null;
    available_capacity: number | null;
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
  capacity: number | null;
  availableCapacity: number | null;
}

let cachedEvents: AppEvent[] = [];
let lastFetchTime = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000;

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
      if (event.attributes.status === "archived") continue;

      try {
        const datesRes = await fetch(
          `https://api.ticketsource.io/events/${event.id}/dates?per_page=100`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (!datesRes.ok) continue;

        const datesData = await datesRes.json();
        const dates: TicketSourceDate[] = datesData.data || [];

        if (dates.length === 0) {
          allAppEvents.push({
            id: event.id,
            title: event.attributes.name,
            description: event.attributes.description || "",
            date: "",
            time: "",
            endDate: null,
            endTime: null,
            status: event.attributes.status,
            isSoldOut: false,
            ticketUrl: event.attributes.url || `https://www.ticketsource.com/the147`,
            capacity: null,
            availableCapacity: null,
          });
        } else {
          for (const d of dates) {
            allAppEvents.push({
              id: `${event.id}_${d.id}`,
              title: event.attributes.name,
              description: event.attributes.description || "",
              date: d.attributes.date || "",
              time: d.attributes.time || "",
              endDate: d.attributes.end_date || null,
              endTime: d.attributes.end_time || null,
              status: d.attributes.status || event.attributes.status,
              isSoldOut: d.attributes.is_sold_out || false,
              ticketUrl: event.attributes.url || `https://www.ticketsource.com/the147`,
              capacity: d.attributes.total_capacity ?? null,
              availableCapacity: d.attributes.available_capacity ?? null,
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching dates for event ${event.id}:`, err);
        allAppEvents.push({
          id: event.id,
          title: event.attributes.name,
          description: event.attributes.description || "",
          date: "",
          time: "",
          endDate: null,
          endTime: null,
          status: event.attributes.status,
          isSoldOut: false,
          ticketUrl: event.attributes.url || `https://www.ticketsource.com/the147`,
          capacity: null,
          availableCapacity: null,
        });
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
