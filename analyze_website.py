#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright script to analyze SgetAI website
Takes screenshots and extracts detailed HTML/CSS information
"""

import asyncio
import json
import sys
import os
from pathlib import Path
from datetime import datetime

# Fix encoding for Windows console
if sys.platform.startswith('win'):
    os.system('chcp 65001 > nul')

async def analyze_website():
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Installing Playwright...")
        import subprocess
        subprocess.check_call(['pip', 'install', 'playwright', '-q'])
        from playwright.async_api import async_playwright

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        print("[*] Navigating to https://pro-networker-ai.lovable.app/pro...")
        await page.goto("https://pro-networker-ai.lovable.app/pro", wait_until="networkidle")

        # Wait for content to load
        await page.wait_for_timeout(2000)

        # Take full-page screenshot
        screenshot_path = Path("D:/Desktop/GetAI/website_screenshot.png")
        await page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"[OK] Screenshot saved: {screenshot_path}")

        # Extract detailed HTML structure
        print("\n[*] Analyzing page structure...")

        analysis = {
            "timestamp": datetime.now().isoformat(),
            "url": "https://pro-networker-ai.lovable.app/pro",
            "sections": []
        }

        # Get main sections
        sections = await page.locator("section, [class*='section'], [class*='container'], [role='main']").all()
        print(f"Found {len(sections)} major sections")

        for i, section in enumerate(sections[:5]):  # Analyze first 5 sections
            try:
                section_text = await section.text_content()
                section_class = await section.get_attribute("class")
                section_id = await section.get_attribute("id")

                # Get computed styles
                styles = await section.evaluate("""
                    el => {
                        const computed = window.getComputedStyle(el);
                        return {
                            backgroundColor: computed.backgroundColor,
                            color: computed.color,
                            padding: computed.padding,
                            margin: computed.margin,
                            borderRadius: computed.borderRadius,
                            boxShadow: computed.boxShadow,
                        };
                    }
                """)

                section_info = {
                    "index": i,
                    "id": section_id,
                    "class": section_class,
                    "textPreview": section_text[:200] if section_text else "",
                    "styles": styles
                }

                # Get child components
                cards = await section.locator("[class*='card'], article, [role='article']").all()
                section_info["cardCount"] = len(cards)

                if cards and len(cards) > 0:
                    # Analyze first card
                    first_card = cards[0]
                    card_html = await first_card.inner_html()
                    card_text = await first_card.text_content()

                    section_info["firstCard"] = {
                        "text": card_text[:300] if card_text else "",
                        "html": card_html[:500] if card_html else ""
                    }

                analysis["sections"].append(section_info)

            except Exception as e:
                print(f"  Error analyzing section {i}: {e}")

        # Extract all headings and text content
        print("\n[*] Extracting text content...")

        headings = await page.locator("h1, h2, h3, h4").all()
        analysis["headings"] = []
        for heading in headings[:10]:
            text = await heading.text_content()
            tag = await heading.evaluate("el => el.tagName")
            analysis["headings"].append({
                "tag": tag,
                "text": text
            })

        # Get color palette used
        print("\n[*] Analyzing colors...")
        colors = await page.evaluate("""
            () => {
                const colors = new Set();
                const elements = document.querySelectorAll('*');
                elements.forEach(el => {
                    const bg = window.getComputedStyle(el).backgroundColor;
                    const color = window.getComputedStyle(el).color;
                    if (bg !== 'rgba(0, 0, 0, 0)') colors.add(bg);
                    if (color !== 'rgba(0, 0, 0, 0)') colors.add(color);
                });
                return Array.from(colors).slice(0, 20);
            }
        """)
        analysis["colors"] = colors

        # Get all buttons and their styling
        print("\n[*] Analyzing buttons...")
        buttons = await page.locator("button, [role='button'], input[type='button'], input[type='submit']").all()
        analysis["buttonCount"] = len(buttons)

        if buttons:
            first_button = buttons[0]
            button_styles = await first_button.evaluate("""
                el => {
                    const computed = window.getComputedStyle(el);
                    return {
                        backgroundColor: computed.backgroundColor,
                        color: computed.color,
                        padding: computed.padding,
                        borderRadius: computed.borderRadius,
                        fontSize: computed.fontSize,
                        fontWeight: computed.fontWeight,
                    };
                }
            """)
            analysis["buttonSample"] = button_styles

        # Get viewport info
        analysis["viewport"] = {
            "width": page.viewport_size["width"],
            "height": page.viewport_size["height"]
        }

        # Save analysis to JSON
        analysis_path = Path("D:/Desktop/GetAI/website_analysis.json")
        with open(analysis_path, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=2, default=str, ensure_ascii=False)
        print(f"[OK] Analysis saved: {analysis_path}")

        # Print summary
        print("\n" + "="*60)
        print("WEBSITE ANALYSIS SUMMARY")
        print("="*60)
        print(f"URL: {analysis['url']}")
        print(f"Sections: {len(analysis['sections'])}")
        print(f"Buttons: {analysis['buttonCount']}")
        print(f"Headings: {len(analysis['headings'])}")
        print(f"Unique Colors: {len(analysis['colors'])}")
        print("\nHeadings found:")
        for h in analysis["headings"]:
            print(f"  {h['tag']}: {h['text']}")

        await browser.close()
        print("\n[OK] Analysis complete!")

# Run the script
if __name__ == "__main__":
    asyncio.run(analyze_website())
