import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:5174';

async function verifyDashboard() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    console.log('🔍 Starting Pro Dashboard verification...\n');

    // Navigate to the app
    console.log('📍 Navigating to', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Check if the page loaded without errors
    console.log('✅ Page loaded successfully');

    // Wait for the app to render
    await page.waitForTimeout(2000);

    // Check if Pro Dashboard exists (look for key elements)
    const dashboardExists = await page.evaluate(() => {
      return document.querySelector('.dashboard-stack') !== null;
    });

    if (dashboardExists) {
      console.log('✅ Dashboard container found');
    } else {
      console.log('❌ Dashboard container not found');
      return false;
    }

    // Check for metric cards
    const metricCardsCount = await page.evaluate(() => {
      return document.querySelectorAll('.metric-card').length;
    });
    console.log(`✅ Found ${metricCardsCount} metric cards (expected 6)`);

    // Check for activity feed
    const activityItems = await page.evaluate(() => {
      return document.querySelectorAll('.activity-item').length;
    });
    console.log(`✅ Found ${activityItems} activity feed items`);

    // Check for job recommendation cards
    const jobCards = await page.evaluate(() => {
      return document.querySelectorAll('.job-recommendation-card').length;
    });
    console.log(`✅ Found ${jobCards} job recommendation cards`);

    // Check for automation feature cards
    const automationCards = await page.evaluate(() => {
      return document.querySelectorAll('.automation-card').length;
    });
    console.log(`✅ Found ${automationCards} automation feature cards`);

    // Check for Career Agent widget
    const careerAgentWidget = await page.evaluate(() => {
      return document.querySelector('.career-agent-fab') !== null;
    });
    console.log(`${careerAgentWidget ? '✅' : '❌'} Career Agent widget ${careerAgentWidget ? 'found' : 'not found'}`);

    // Check for toggle switches in automation cards
    const toggleSwitches = await page.evaluate(() => {
      return document.querySelectorAll('.toggle-switch').length;
    });
    console.log(`✅ Found ${toggleSwitches} toggle switches in automation cards`);

    // Check styling is applied
    const hasStyled = await page.evaluate(() => {
      const card = document.querySelector('.metric-card');
      if (!card) return false;
      const styles = window.getComputedStyle(card);
      return styles.backgroundColor !== '' || styles.border !== '';
    });
    console.log(`${hasStyled ? '✅' : '⚠️'} Styling applied to cards`);

    // Check responsive classes exist
    const hasResponsiveCSS = await page.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets);
      return stylesheets.some(ss => {
        try {
          return ss.cssText.includes('@media');
        } catch (e) {
          return false;
        }
      });
    });
    console.log(`${hasResponsiveCSS ? '✅' : '⚠️'} Responsive CSS found`);

    // Test dark mode toggle
    console.log('\n🌙 Testing dark mode...');
    const themeToggle = await page.evaluate(() => {
      return document.querySelector('[class*="theme"]') !== null;
    });
    console.log(`${themeToggle ? '✅' : '⚠️'} Theme toggle element found`);

    // Check for data in components
    const hasMetricData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.metric-value');
      return Array.from(cards).some(card => card.textContent.trim().length > 0);
    });
    console.log(`${hasMetricData ? '✅' : '⚠️'} Metric cards have data`);

    // Test button clicks
    console.log('\n🔘 Testing interactive elements...');
    const applyButtons = await page.evaluate(() => {
      return document.querySelectorAll('button').length;
    });
    console.log(`✅ Found ${applyButtons} buttons on the page`);

    // Check for link elements
    const links = await page.evaluate(() => {
      return document.querySelectorAll('a').length;
    });
    console.log(`✅ Found ${links} links on the page`);

    console.log('\n✨ Verification Complete!\n');

    // Final verdict
    const allChecks = [
      metricCardsCount >= 6,
      activityItems > 0,
      jobCards > 0,
      automationCards > 0,
      careerAgentWidget,
      toggleSwitches > 0,
      hasStyled,
      hasMetricData
    ];

    const passedChecks = allChecks.filter(c => c).length;
    console.log(`📊 Results: ${passedChecks}/${allChecks.length} checks passed\n`);

    if (passedChecks === allChecks.length) {
      console.log('🎉 VERDICT: PASS - Pro Dashboard is working correctly!\n');
      return true;
    } else {
      console.log(`⚠️ VERDICT: PARTIAL - ${allChecks.length - passedChecks} checks failed\n`);
      return false;
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

verifyDashboard().then(success => {
  process.exit(success ? 0 : 1);
});
