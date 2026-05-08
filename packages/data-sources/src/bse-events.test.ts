import { describe, expect, it } from "bun:test";
import { Effect } from "effect";

import {
  BSE_ANNOUNCEMENTS_FEED_URL,
  fetchBseAnnouncements,
  filterCorporateEvents,
  parseBseAnnouncementsXml,
  searchBseAnnouncements,
} from "./bse-events.ts";

describe("data-sources / bse events", () => {
  const sampleXml = `
    <?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Reliance Industries Ltd (500325)</title>
          <link>https://www.bseindia.com/xml-data/corpfiling/AttachLive/sample1.pdf</link>
          <scripcode>500325</scripcode>
          <description>Financial Results for quarter ended March 2026</description>
          <pubDate>17-Apr-2026 13:39:53</pubDate>
        </item>
        <item>
          <title>Reliance Industries Ltd (500325)</title>
          <link>https://www.bseindia.com/xml-data/corpfiling/AttachLive/sample2.pdf</link>
          <scripcode>500325</scripcode>
          <description>Board Meeting Intimation</description>
          <pubDate>16-Apr-2026 13:39:53</pubDate>
        </item>
      </channel>
    </rss>
  `;

  it("parses bse announcement xml into events", () => {
    const events = parseBseAnnouncementsXml(sampleXml);

    expect(events).toHaveLength(2);
    expect(events[0]?.source).toBe("bse_announcements");
    expect(events[0]?.scripCode).toBe("500325");
  });

  it("filters events by query", () => {
    const events = parseBseAnnouncementsXml(sampleXml);
    const filtered = filterCorporateEvents("financial results", events);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.description).toContain("Financial Results");
  });

  it("fetches and parses the bse announcements feed", async () => {
    const fetchStub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(BSE_ANNOUNCEMENTS_FEED_URL);
      return new Response(sampleXml, { status: 200 });
    }) as unknown as typeof fetch;

    const events = await Effect.runPromise(fetchBseAnnouncements(fetchStub));

    expect(events).toHaveLength(2);
  });

  it("searches the bse announcements feed with injected fetch", async () => {
    const fetchStub = (async () => new Response(sampleXml, { status: 200 })) as unknown as typeof fetch;

    const events = await Effect.runPromise(searchBseAnnouncements("board meeting", fetchStub));

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toContain("Reliance");
  });
});
