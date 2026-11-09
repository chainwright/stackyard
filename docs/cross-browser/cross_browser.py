"""P1-4: the exported class file and living file (incl. Save a Copy -> open the copy) in Playwright Chromium,
Firefox and WebKit, network off. Prints a JSON result per browser/check."""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
DIR = sys.argv[1]; OUTJ = sys.argv[2]
NAME = "The-water-cycle-4th-class-quiz-flash-cards-and-a-raindrop-story"
CLASS, LIVING = f"{DIR}/{NAME}-class.html", f"{DIR}/{NAME}.html"

async def go_offline(ctx, emulate=True):
    """The network is OFF for this context: every http(s) request is aborted and (unless emulate=False) the
    browser is put offline too. WebKit's offline emulation refuses file:// loads, so WebKit gets the abort only."""
    async def block(route): await route.abort("internetdisconnected")
    await ctx.route("http://*/**", block); await ctx.route("https://*/**", block)
    if emulate: await ctx.set_offline(True)

async def play_to_end(pg, res):
    stack = json.loads(await pg.evaluate("document.getElementById('stack-data').textContent"))
    right = {i + 1: e["label"] for i, c in enumerate(stack["cards"]) for e in c["elements"]
             if e["type"] == "button" and any(a["type"] == "score" and a.get("delta") == 1 for a in e["actions"])}
    for _ in range(40):
        meta = await pg.evaluate("document.querySelector('.sy-meta')?.textContent || ''")
        n = int(meta.split()[1]) if meta.startswith("Card") else None
        txt = (await pg.locator(".sy-card").inner_text()).lower()
        if n is None or "finished" in txt:
            res["end_text"] = " ".join(txt.split())[:80]; return "score" in txt
        if await pg.locator(".sy-card .sy-tile").count():
            await pg.locator(".sy-card .sy-tile", has_text=right[n]).first.click(); await pg.wait_for_timeout(1500)
        elif await pg.locator(".sy-card .sy-flash").count():
            await pg.locator(".sy-card .sy-flash").click(); await pg.wait_for_timeout(700)
            await pg.get_by_role("button", name="Next Card").click(); await pg.wait_for_timeout(700)
        else:
            await pg.locator(".sy-card button").first.click(); await pg.wait_for_timeout(900)
    return False

async def one(p, bname):
    out = {"browser": bname}
    bt = getattr(p, bname); b = await bt.launch(); out["version"] = b.version
    try:
        ctx = await b.new_context(viewport={"width": 1366, "height": 768}, accept_downloads=True); await go_offline(ctx, emulate=(bname != "webkit")); out["network_off"] = "all http/https aborted" + ("" if bname == "webkit" else " + offline emulation")
        net = []; ctx.on("request", lambda q: net.append(q.url[:60]) if not q.url.startswith(("file:", "blob:", "data:", "about:")) else None)
        errs = []
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:120])); pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        # class file
        await pg.goto("file://" + CLASS); await pg.wait_for_timeout(800)
        r = {}; out["class_plays_to_score"] = await play_to_end(pg, r); out["class_end"] = r.get("end_text")
        out["class_has_teacher_tab"] = await pg.locator(".sy-teacher-tab").count() > 0
        # living file: Teacher -> edit -> Save a Copy -> open the copy
        await pg.goto("file://" + LIVING); await pg.wait_for_timeout(800)
        await pg.click(".sy-teacher-tab"); await pg.wait_for_timeout(700)
        await pg.locator(".sy-living-overlay").get_by_text("What powers the water").click(); await pg.wait_for_timeout(500)
        await pg.locator(".sy-living-canvas .sy-tile", has_text="Rain clods").click(); await pg.wait_for_timeout(400)
        inp = pg.locator(".sy-living-inspector input[type=text]"); await inp.fill("Rain clouds"); await pg.wait_for_timeout(500)
        out["living_edit_shows_on_card"] = await pg.locator(".sy-living-canvas .sy-tile", has_text="Rain clouds").count() > 0
        async with pg.expect_download(timeout=10000) as dl:
            await pg.locator(".sy-living-bar button", has_text="Save a Copy").click()
        d = await dl.value; cp = f"{DIR}/xb_{bname}_{d.suggested_filename}"; await d.save_as(cp)
        out["copy_name"] = d.suggested_filename; out["copy_kb"] = round(os.path.getsize(cp) / 1024, 1)
        await pg.goto("file://" + cp); await pg.wait_for_timeout(800)
        out["copy_has_teacher_tab"] = await pg.locator(".sy-teacher-tab").count() == 1
        out["copy_has_no_overlay"] = await pg.locator(".sy-living-overlay").count() == 0
        out["copy_keeps_edit"] = "Rain clouds" in await pg.evaluate("document.getElementById('stack-data').textContent")
        r = {}; out["copy_plays_to_score"] = await play_to_end(pg, r); out["copy_end"] = r.get("end_text")
        out["network_requests"] = len(net); out["page_errors"] = errs
        out["PASS"] = all(out[k] for k in ["class_plays_to_score", "living_edit_shows_on_card", "copy_has_teacher_tab",
                                           "copy_has_no_overlay", "copy_keeps_edit", "copy_plays_to_score"]) and not net and not errs
    except Exception as e:
        out["error"] = repr(e)[:300]; out["PASS"] = False
    await b.close(); return out

async def main():
    async with async_playwright() as p:
        res = [await one(p, n) for n in ("chromium", "firefox", "webkit")]
    json.dump(res, open(OUTJ, "w"), indent=1); print(json.dumps(res, indent=1))
asyncio.run(main())
