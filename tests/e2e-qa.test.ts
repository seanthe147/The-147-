const API_BASE = "http://localhost:5000";
const STAFF_PIN = process.env.STAFF_PIN || "2012";

let staffToken = "";
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function run() {
  console.log("E2E QA Test Suite");
  console.log("=================\n");

  console.log("Customer Flows:");

  {
    const res = await fetch(`${API_BASE}/api/events`);
    const data = await res.json();
    assert(res.status === 200, "GET /api/events returns 200");
    assert(Array.isArray(data) && data.length > 0, "Events list is non-empty");
  }

  {
    const res = await fetch(`${API_BASE}/api/offers`);
    const data = await res.json();
    assert(res.status === 200, "GET /api/offers returns 200");
    assert(Array.isArray(data), "Offers returns an array");
  }

  {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10 + Math.floor(Math.random() * 10));
    const dateStr = futureDate.toISOString().split("T")[0];

    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "QA Test User",
        customerEmail: "qa@test.com",
        customerPhone: "07700900000",
        tableType: "pool",
        date: dateStr,
        startTime: "14:00",
        duration: 1,
        gdprConsent: true,
      }),
    });
    const data = await res.json();
    assert(res.status === 201, "POST /api/bookings creates booking (201)");
    assert(data.id !== undefined, "Booking has an ID");
    assert(data.customerName === "QA Test User", "Booking name matches");
  }

  {
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 25 + Math.floor(Math.random() * 10));
    const dateStr = dayAfter.toISOString().split("T")[0];
    const payload = {
      customerName: "Double Submit User",
      customerEmail: "double@test.com",
      customerPhone: "07700900001",
      tableType: "snooker",
      date: dateStr,
      startTime: "10:00",
      duration: 2,
      gdprConsent: true,
    };

    await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res2 = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(
      [400, 409].includes(res2.status),
      `Double-submit rejected with ${res2.status} (must be 400 or 409)`
    );
  }

  {
    const res = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "QA Tester",
        email: "qa@test.com",
        subject: "E2E Test",
        message: "E2E test contact message",
        gdprConsent: true,
      }),
    });
    assert([200, 201].includes(res.status), "POST /api/contact succeeds");
  }

  console.log("\nStaff Portal Flows:");

  {
    const res = await fetch(`${API_BASE}/api/staff/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: STAFF_PIN }),
    });
    const data = await res.json();
    assert(res.status === 200, "Staff login with master PIN returns 200");
    assert(data.token !== undefined, "Login returns a token");
    assert(data.role === "manager", "Login returns manager role");
    staffToken = data.token;
  }

  {
    const res = await fetch(`${API_BASE}/api/staff/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "0000" }),
    });
    assert([401, 400].includes(res.status), "Invalid PIN rejected");
  }

  {
    const res = await fetch(`${API_BASE}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        title: "QA Automated Test Event",
        description: "Created by E2E test suite",
        date: "2026-12-25",
        time: "19:00",
        active: true,
        eventType: "event",
      }),
    });
    const data = await res.json();
    assert(res.status === 201, "POST /api/events creates event (staff auth)");
    assert(data.id !== undefined, "Event has an ID");
    assert(data.title === "QA Automated Test Event", "Event title matches");
  }

  {
    const res = await fetch(`${API_BASE}/api/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        title: "QA Test Offer",
        subtitle: "Automated test",
        description: "10% off pool",
        discount: "10%",
        validUntil: "2026-12-31",
        gradient: "blue",
      }),
    });
    const data = await res.json();
    assert(res.status === 201, "POST /api/offers creates offer (staff auth)");
    assert(data.id !== undefined, "Offer has an ID");
  }

  {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `${API_BASE}/api/bookings?date=${today}`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    assert([200, 304].includes(res.status), "GET /api/bookings accessible (staff)");
  }

  {
    const res = await fetch(`${API_BASE}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Should Fail",
        description: "No auth",
        date: "2026-12-25",
        time: "19:00",
        active: true,
        eventType: "event",
      }),
    });
    assert(
      [401, 403].includes(res.status),
      "Unauthenticated event creation rejected"
    );
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
