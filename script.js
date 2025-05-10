const pup = require("puppeteer");
const { id, pass, content, content2 } = require("./secret");

async function main() {
  let browser;
  let page;
  try {
    browser = await pup.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"],
      slowMo: 50
    });

    [page] = await browser.pages();

    // 1. Login
    await login(page);

    // 2. Navigate directly to internships
    await page.goto("https://internshala.com/internships", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // 3. Apply to first internship
    await applyToFirstInternship(page);

  } catch (error) {
    console.error("Error:", error.message);
    if (page) {
      await page.screenshot({ path: "error.png" });
    }
  } finally {
    if (browser) await browser.close();
  }
}

async function login(page) {
  await page.goto("https://internshala.com/", { waitUntil: "networkidle2" });

  // Handle cookie consent
  try {
    await page.click('button:has-text("Accept")');
  } catch (error) {
    console.log("Cookie consent button not found, skipping...");
  }

  await page.click('button[data-target="#login-modal"]');
  await page.type("#modal_email", id, { delay: 50 });
  await page.type("#modal_password", pass, { delay: 60 });
  await page.click("#modal_login_submit");
  await page.waitForNavigation({ waitUntil: "networkidle2" });
}

async function applyToFirstInternship(page) {
  try {
    console.log("Navigating to internships...");
    const internships = await page.$$(".internship_meta"); // Updated selector
    if (!internships || internships.length === 0) {
      console.log("No internships available");
      throw new Error("No internships available");
    }

    for (const internship of internships) {
      const internshipType = await internship.evaluate(el => el.textContent);
      console.log(`Internship type: ${internshipType}`); // Check what this returns

      if (internshipType && internshipType.toLowerCase().includes("internship")) {
        console.log("Opening a valid internship...");
        await internship.click(); // Click on the internship to open it
        await delay(3000); // Wait for the page to load

        console.log("Processing application...");
        await processApplication(page);

        console.log("Successfully applied to internship!");
        return;
      } else {
        console.log("Skipping non-internship entry...");
      }
    }

    console.log("No valid internships found to apply.");
  } catch (error) {
    console.error(`Application failed: ${error.message}`);
    throw new Error(`Application failed: ${error.message}`);
  }
}


async function openNewTab(page, element) {
  const newPagePromise = new Promise(resolve => page.once('popup', resolve));
  await element.click({ button: 'middle' });
  const newPage = await newPagePromise;
  await newPage.bringToFront();
  return newPage;
}

async function debugVisibleElements(page) {
  try {
    console.log("Capturing all visible buttons and modals on the page...");

    // Log all visible buttons
    const buttons = await page.$$eval("button", (btns) =>
      btns.map((btn) => ({ text: btn.innerText, id: btn.id, class: btn.className }))
    );
    console.log("Visible buttons:", buttons);

    // Log all visible modals
    const modals = await page.$$eval(".modal", (modals) =>
      modals.map((modal) => ({ id: modal.id, class: modal.className, visible: modal.style.display !== "none" }))
    );
    console.log("Visible modals:", modals);

    // Save the debug information to a file
    const fs = require("fs");
    fs.writeFileSync("debug-elements.json", JSON.stringify({ buttons, modals }, null, 2));
    console.log("Saved debug information to debug-elements.json");
  } catch (error) {
    console.error("Error while capturing visible elements:", error);
  }
}

async function debugVisibleInputs(page) {
  try {
    console.log("Capturing all visible input fields and text areas on the page...");

    // Log all visible input fields
    const inputs = await page.$$eval("input", (fields) =>
      fields.map((field) => ({
        type: field.type,
        id: field.id,
        class: field.className,
        placeholder: field.placeholder,
        visible: field.offsetParent !== null
      }))
    );
    console.log("Visible input fields:", inputs);

    // Log all visible text areas
    const textAreas = await page.$$eval("textarea", (areas) =>
      areas.map((area) => ({
        id: area.id,
        class: area.className,
        placeholder: area.placeholder,
        visible: area.offsetParent !== null
      }))
    );
    console.log("Visible text areas:", textAreas);

    // Save the debug information to a file
    const fs = require("fs");
    fs.writeFileSync("debug-inputs.json", JSON.stringify({ inputs, textAreas }, null, 2));
    console.log("Saved debug information to debug-inputs.json");
  } catch (error) {
    console.error("Error while capturing visible inputs and text areas:", error);
  }
}

async function processApplication(page) {
  try {
    console.log("Waiting for page to load...");

    // Retry logic for handling timeouts
    const maxRetries = 3;
    let retries = 0;
    let pageLoaded = false;

    while (retries < maxRetries && !pageLoaded) {
      try {
        await page.waitForNetworkIdle({ timeout: 30000 }); // Increased timeout to 30 seconds
        pageLoaded = true;
      } catch (error) {
        retries++;
        console.log(`Retrying page load... Attempt ${retries} of ${maxRetries}`);
        if (retries === maxRetries) {
          throw new Error("Page load failed after multiple attempts.");
        }
      }
    }

    console.log("Closing modals if any...");
    await closeModals(page);

    console.log("Checking for apply button...");
    if (await page.$("#apply_now")) { // Updated selector
      console.log("Clicking apply now button...");
      await page.click("#apply_now");
      await delay(2000); // Ensure the click is processed
    } else {
      console.log("Trying alternative apply buttons...");
      await clickApplyButton(page);
    }

    console.log("Capturing visible inputs for debugging...");
    await debugVisibleInputs(page);

    console.log("Filling application form...");
    await fillApplicationForm(page);

    console.log("Submitting application...");
    await submitApplication(page);

    console.log("Application submitted successfully!");

  } catch (error) {
    console.error("Error during application process:", error);

    // Capture the page HTML for debugging
    const pageContent = await page.content();
    const fs = require('fs');
    fs.writeFileSync('application-debug.html', pageContent);
    console.log("Saved page HTML to application-debug.html for analysis.");

    await page.screenshot({ path: "application-error.png" });
    throw error;
  }
}

async function fillApplicationForm(page) {
  try {
    console.log("Waiting for the application modal to load...");

    const modalSelector = "#easy_apply_modal";
    await page.waitForSelector(modalSelector, { visible: true, timeout: 20000 });

    console.log("Focusing on the application modal...");
    await page.evaluate((selector) => {
      const modal = document.querySelector(selector);
      if (modal) modal.scrollIntoView({ behavior: "smooth", block: "center" });
    }, modalSelector);

    console.log("Detecting questions and filling responses...");
    const questionSelectors = await page.$$(".question-label, label, .form-question");

    for (const question of questionSelectors) {
      const questionText = await page.evaluate(el => el.innerText.toLowerCase(), question);

      if (questionText.includes("why should we hire you")) {
        console.log("Answering 'Why should we hire you'...");
        const answer = "I bring a strong blend of skills in web development and AI, along with a passion for building user-focused solutions.";
        await fillAnswer(page, question, answer);
      } else if (questionText.includes("availability")) {
        console.log("Answering 'Availability'...");
        const answer = "I am available full-time for the next 6 months.";
        await fillAnswer(page, question, answer);
      } else if (questionText.includes("start date")) {
        console.log("Answering 'Start Date'...");
        const answer = "2025-05-01";
        await fillAnswer(page, question, answer);
      } else {
        console.log(`Skipping unknown question: ${questionText}`);
      }
    }

    console.log("Finished filling the application form.");
  } catch (error) {
    console.error("Error while filling the application form:", error);
    const pageContent = await page.content();
    const fs = require("fs");
    fs.writeFileSync("form-debug.html", pageContent);
    console.log("Saved page HTML to form-debug.html for analysis.");
    throw error;
  }
}

async function fillAnswer(page, questionElement, answer) {
  const inputSelector = await questionElement.evaluate(el => {
    const input = el.closest(".form-group")?.querySelector("input, textarea");
    return input ? input : null; // Return the element itself
  });

  if (inputSelector) {
    console.log("Filling input field:", inputSelector);
    await page.evaluate((input, value) => {
      input.value = value;
    }, inputSelector, answer);
  } else {
    console.log("No input field found for the question.");
  }
}

async function submitApplication(page) {
  try {
    console.log("Waiting for submit button...");
    const submitButtonSelector = "#submit";
    await page.waitForSelector(submitButtonSelector, { visible: true, timeout: 5000 });

    console.log("Clicking submit button...");
    await page.click(submitButtonSelector);

    console.log("Waiting for success message or confirmation...");
    try {
      // Increased timeout and added a more detailed check for success
      await page.waitForSelector('.success-message, .confirmation-modal', { timeout: 10000 });
      console.log("Application successfully submitted!");
    } catch (confirmationError) {
      console.log("No success message found, checking page content...");

      // Capture page HTML for debugging
      const pageContent = await page.content();
      const fs = require('fs');
      fs.writeFileSync('submission-debug.html', pageContent);
      console.log("Saved page HTML to submission-debug.html for analysis.");

      throw new Error("Success message not found. Submission might have failed.");
    }
  } catch (error) {
    console.error("Error during submission:", error);
    await page.screenshot({ path: "submission-error.png" });
    throw error;
  }
}


async function closeModals(page) {
  try {
    // Handle the "Exit application?" modal
    const exitModalCancelButton = await page.$('button:has-text("Cancel")');
    if (exitModalCancelButton) {
      console.log("Closing 'Exit application?' modal by clicking Cancel...");
      await exitModalCancelButton.click();
      await delay(2000); // Wait for the modal to close
    }

    // Handle other modals
    const closeButtons = await page.$$('.modal-close, .close, [aria-label="Close"]');
    for (const btn of closeButtons) {
      await btn.click();
      await delay(500);
    }
  } catch (error) {
    // No modals found
    console.log("No modals to close or error while closing modals.");
  }
}

async function clickApplyButton(page) {
  const selectors = [
    "button.apply-now:not([disabled])",
    "a.btn-apply",
    ".btn-primary[href*='apply']",
    "button:has-text('Apply Now')",
    "#apply_now",
    "#continue_button", // Added selector for modal button
    ".modal .btn-primary" // Added generic modal button selector
  ];

  for (const selector of selectors) {
    try {
      console.log(`Trying selector: ${selector}`);
      await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      console.log(`Clicking selector: ${selector}`);
      await page.click(selector);
      await delay(2000); // Ensure the click is processed
      return;
    } catch (error) {
      console.log(`Selector failed: ${selector}`);
      continue;
    }
  }
  throw new Error("No apply button found");
}

// Utility function to introduce delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyToAllInternships(page) {
  try {
    console.log("Applying to all related internships...");

    while (true) {
      // Wait for the "Continue applying" button
      const continueButtonSelector = "button:has-text('Continue applying')";
      const continueButtonExists = await page.$(continueButtonSelector);

      if (continueButtonExists) {
        console.log("Clicking 'Continue applying' button...");
        await page.click(continueButtonSelector);
        await page.waitForTimeout(3000); // Wait for the next internship to load

        console.log("Processing next application...");
        await processApplication(page);
      } else {
        console.log("No more internships to apply to.");
        break;
      }
    }

    console.log("Finished applying to all internships.");
  } catch (error) {
    console.error("Error while applying to all internships:", error);
    throw error;
  }
}

// Start the main function
main();