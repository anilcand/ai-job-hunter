// ==========================================
// AI_JOB_HUNTER - AUTONOMOUS HR ASSISTANT
// ==========================================

// --- USER SETTINGS ---
var CV_DOC_ID = "YOUR_GOOGLE_DOC_CV_ID_HERE";
var SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
var LABEL_NAME = "job_search_scanning"; 
var MIN_MATCH_SCORE = 65; 
var EXCLUDE_JOB_TYPES = "active student roles, unpaid internships, volunteer work, senior academic roles (Professor, PostDoc)";
var INCLUDE_JOB_TYPES = "Corporate roles, Industry positions, PhD Researcher, Doctoral Student";

var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

// ==========================================
// 1. EMAIL SCANNER
// ==========================================
function runEmailScanner() {
  Logger.log("🚀 AI Job Hunter: Starting Email Scan...");
  
  if (!GEMINI_API_KEY) { Logger.log("ERROR: API Key not found!"); return; }
  
  var activeModel = getActiveModel(GEMINI_API_KEY);
  if (!activeModel) { Logger.log("ERROR: Model not found!"); return; }
  
  var myCvText = "";
  try { myCvText = DocumentApp.openById(CV_DOC_ID).getBody().getText(); } 
  catch(e) { Logger.log("ERROR: Failed to read CV."); return; }
  
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) { Logger.log("ERROR: Label not found."); return; }
  
  var threads = label.getThreads();
  var processedCount = 0;
  
  threads.forEach(function(thread) {
    if (thread.isUnread()) { 
      var messages = thread.getMessages();
      var threadLink = "https://mail.google.com/mail/u/0/#inbox/" + thread.getId(); 
      
      messages.forEach(function(message) {
        if (message.isUnread()) { 
          message.markRead(); 
          
          var subject = message.getSubject();
          var date = message.getDate();
          var body = message.getPlainBody();
          
          // Split the email body by dash separators (to handle newsletter formats)
          var subMessages = body.split(/-{30,}/);
          
          // CRITICAL FIX: If no dashes found (single job email), start at index 0. 
          // If it's a newsletter, start at index 1 to skip the intro text.
          var startIndex = (subMessages.length > 1) ? 1 : 0;
          
          for (var i = startIndex; i < subMessages.length; i++) {
            var jobText = subMessages[i].trim();
            jobText = jobText.replace(/^(Message:|Date:|From:|To:|Subject:|Message-ID:|Content-Type:|Content-Transfer-Encoding:|Reply-To:).*\n?/gim, "").trim();
            jobText = jobText.substring(0, 3000); 
            
            if (jobText.length > 200) { 
              Logger.log("Sending job description to AI...");
              var aiAnalysis = evaluateWithGemini(myCvText, jobText, activeModel);
              
              if (aiAnalysis === "QUOTA_ERROR") {
                Logger.log("⏳ Google Quota Reached! Sleeping for 60 seconds...");
                Utilities.sleep(60000); 
                i--; 
                continue; 
              }
              
              if (aiAnalysis && aiAnalysis.score >= MIN_MATCH_SCORE) {
                Logger.log("✅ MATCH FOUND! Score: " + aiAnalysis.score + "%");
                var actualTitle = aiAnalysis.job_title ? aiAnalysis.job_title : subject;
                var shortSummary = aiAnalysis.summary ? aiAnalysis.summary : "No summary provided.";
                var jobType = aiAnalysis.job_type ? aiAnalysis.job_type : "Unknown";
                
                // ORDER: Date, Type, Score, Title, Reason, Summary, Link
                sheet.appendRow([date, jobType, aiAnalysis.score + "%", actualTitle, aiAnalysis.reason, shortSummary, threadLink]);
              }
            }
          }
        } 
      }); // messages.forEach ends
      processedCount++;
    }
  }); // threads.forEach ends
  
  Logger.log("🎉 Email Scan Completed.");
}

// ==========================================
// 2. HELPER FUNCTIONS 
// ==========================================
function getActiveModel(apiKey) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
  try {
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var data = JSON.parse(response.getContentText());
    if (data.models) {
      for (var i = 0; i < data.models.length; i++) {
        var m = data.models[i];
        if (m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf("generateContent") !== -1) {
          if (m.name.indexOf("flash") !== -1 || m.name.indexOf("pro") !== -1) return m.name; 
        }
      }
      for (var j = 0; j < data.models.length; j++) {
        var n = data.models[j];
        if (n.supportedGenerationMethods && n.supportedGenerationMethods.indexOf("generateContent") !== -1) return n.name;
      }
    }
  } catch(e) {}
  return null;
}

function evaluateWithGemini(cvText, jobText, modelName) {
  var url = "https://generativelanguage.googleapis.com/v1beta/" + modelName + ":generateContent?key=" + GEMINI_API_KEY;
  
var prompt = "You are an expert HR ATS AI. Read the following Job Posting text and compare it with the Candidate CV.\n\n" +
               "CRITICAL RULE 1: If the job explicitly falls into any of these exclusion categories: [" + EXCLUDE_JOB_TYPES + "], you MUST assign a score of 0.\n" +
               "CRITICAL RULE 2: Roles matching these inclusion categories: [" + INCLUDE_JOB_TYPES + "] ARE FULLY VALID. Do not assign them a 0 automatically. Evaluate and score them normally based on how well the candidate's skills match the requirements.\n\n" +
               "Return ONLY a valid JSON object with EXACTLY these five keys:\n" +
               "1. 'score': integer from 0 to 100 (match percentage).\n" +
               "2. 'reason': 2-sentence explanation of the score.\n" +
               "3. 'job_title': Extract the ACTUAL specific Job Title and Company from the text.\n" +
               "4. 'summary': Write a very short, 1-sentence crisp summary of the role.\n" +
               "5. 'job_type': Classify the job appropriately (e.g., 'Corporate', 'Academic', 'Freelance', etc.).\n\n" +
               "Do not include markdown code blocks or any other text.\n\n" +
               "Candidate CV:\n" + cvText + "\n\n" +
               "Job Posting:\n" + jobText;
               
  var payload = { "contents": [{ "parts": [{"text": prompt}] }] };
  var options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var jsonText = response.getContentText();
    var data = JSON.parse(jsonText);
    
    if (data.error) {
      if (data.error.message.indexOf("Quota") !== -1) return "QUOTA_ERROR";
      return null;
    }
    if (!data.candidates || data.candidates.length === 0) return null;
    
    var aiResponseText = data.candidates[0].content.parts[0].text;
    aiResponseText = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(aiResponseText);
  } catch (e) {
    return null;
  }
}
// ==========================================
// 3. NIGHT WATCHMAN (RESET SHEET)
// ==========================================
function resetGoogleSheet() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
    Logger.log("🧹 Table cleared, ready for a new day!");
  } else {
    Logger.log("Table is already empty.");
  }
}
// ==========================================
// 4. DISCOVERY TEST (MANUAL CHECK)
// ==========================================
function runDiscoveryTest() {
  Logger.log("🕵️‍♂️ STARTING DISCOVERY TESTS...");

  // --- TARGETS TO TEST ---
  // Users can add or remove companies here easily.
  var testTargets = [
    {
      name: "Company A",
      url: "https://jobs.companya.com/search/?q=Junior",
      keywords: ["jobTitle", "Engineer", "Junior"]
    },
    {
      name: "Company B",
      url: "https://jobs.companyb.com/en_US/search",
      keywords: ["job-title", "Developer"]
    },
    {
      name: "Company C",
      url: "https://careers.companyc.com/search",
      keywords: ["vacancy", "Manager", "HR"]
    }
  ];

  testTargets.forEach(function(target) {
    Logger.log("-----------------------------------");
    Logger.log("🕵️‍♂️ TESTING: " + target.name);
    try {
      var response = UrlFetchApp.fetch(target.url, {muteHttpExceptions: true});
      var html = response.getContentText();
      Logger.log(target.name + " Response Code: " + response.getResponseCode());
      
      // Check if any of the indicator keywords exist in the HTML
      var keywordFound = false;
      for (var i = 0; i < target.keywords.length; i++) {
        if (html.indexOf(target.keywords[i]) > -1) {
          keywordFound = true;
          break;
        }
      }
      
      Logger.log("Job data in HTML? : " + (keywordFound ? "✅ YES! (Visible)" : "❌ NO (Hidden or JS rendered)."));
    } catch(e) {
      Logger.log("❌ " + target.name + " Error: " + e.toString());
    }
  });
  
  Logger.log("-----------------------------------");
  Logger.log("🏁 DISCOVERY TESTS COMPLETED.");
}
// ==========================================
// 5. WEB SPIDER (SCRAPER)
// ==========================================
function runWebSpider() {
  Logger.log("🕸️ Web Spider Starting...");
  
  var activeModel = getActiveModel(GEMINI_API_KEY);
  if (!activeModel) { Logger.log("ERROR: Model not found!"); return; }
  
  var myCvText = "";
  try { myCvText = DocumentApp.openById(CV_DOC_ID).getBody().getText(); } 
  catch(e) { Logger.log("ERROR: Failed to read CV."); return; }
  
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  
  // --- TARGET CAREER SITES ---
  // Add your target company job portals here.
  var targets = [
    {
      name: "Company A",
      listUrl: "https://jobs.companya.com/search/?q=Junior&location=Remote",
      baseUrl: "https://jobs.companya.com",
      regex: /href="(\/job\/[^"]+)"/g  // Matches relative URLs (e.g., /job/12345)
    },
    {
      name: "Company B",
      listUrl: "https://jobs.companyb.com/en_US/search",
      baseUrl: "", 
      regex: /href="(https:\/\/jobs\.companyb\.com\/[^"]+\/JobDetail\/[^"]+)"/gi // Matches absolute URLs
    }
  ];
  
  targets.forEach(function(target) {
    Logger.log("🌍 Scanning " + target.name + "...");
    try {
      var html = UrlFetchApp.fetch(target.listUrl, {muteHttpExceptions: true}).getContentText();
      
      var jobLinks = [];
      var match;
      while ((match = target.regex.exec(html)) !== null) {
        var fullLink = target.baseUrl + match[1];
        if (jobLinks.indexOf(fullLink) === -1) { 
          jobLinks.push(fullLink);
        }
      }
      
      Logger.log("Found " + jobLinks.length + " job links on " + target.name + ".");
      
      var limit = Math.min(jobLinks.length, 3); 
      
      for (var i = 0; i < limit; i++) {
        var link = jobLinks[i];
        Logger.log("Reading job: " + link);
        
        var jobHtml = UrlFetchApp.fetch(link, {muteHttpExceptions: true}).getContentText();
        
        var jobText = jobHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .trim()
                             .substring(0, 3000); 
                                       
        if (jobText.length > 200) {
           var today = new Date();
           var aiAnalysis = evaluateWithGemini(myCvText, jobText, activeModel);
           
           if (aiAnalysis === "QUOTA_ERROR") {
              Logger.log("⏳ Quota Reached, sleeping for 60s...");
              Utilities.sleep(60000);
              i--;
              continue;
           }
           
           if (aiAnalysis && aiAnalysis.score >= MIN_MATCH_SCORE) {
              Logger.log("✅ MATCH FOUND! Score: " + aiAnalysis.score + "%");
              var actualTitle = aiAnalysis.job_title ? ("[" + target.name + "] " + aiAnalysis.job_title) : ("[" + target.name + "] New Job");
              var shortSummary = aiAnalysis.summary ? aiAnalysis.summary : "No summary provided.";
              var jobType = aiAnalysis.job_type ? aiAnalysis.job_type : "Unknown";
              
              // ORDER: Date, Type, Score, Title, Reason, Summary, Link
              sheet.appendRow([today, jobType, aiAnalysis.score + "%", actualTitle, aiAnalysis.reason, shortSummary, link]);
           }
           Utilities.sleep(6000); 
        }
      }
      
    } catch(e) {
      Logger.log(target.name + " Scan Error: " + e.toString());
    }
  });
  
  Logger.log("🕸️ Web Spider Completed.");
}
// ==========================================
// 6. UNIVERSAL LINK DETECTIVE
// ==========================================
function runLinkDetective() {
  var SITE_NAME = "Example Company"; 
  var TEST_URL = "https://careers.example-company.com/search/"; 
  var WORD_FILTER = "job"; 
  
  inspectSiteLinks(SITE_NAME, TEST_URL, WORD_FILTER);
}

function inspectSiteLinks(name, url, filter) {
  Logger.log("🕵️‍♂️ Inspecting site [" + name + "]: " + url);
  
  if(filter !== "") {
    Logger.log("🔍 Searching for links containing: '" + filter + "'...");
  } else {
    Logger.log("🔍 No filter applied, fetching all long links...");
  }
  
  try {
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var html = response.getContentText();
    
    var regex = /href="([^"]+)"/gi; 
    var match;
    var links = [];
    
    while ((match = regex.exec(html)) !== null) {
      var foundLink = match[1];
      
      if (foundLink.length > 15 && links.indexOf(foundLink) === -1) { 
        if (filter === "" || foundLink.toLowerCase().indexOf(filter.toLowerCase()) !== -1) {
          links.push(foundLink);
        }
      }
    }
    
    Logger.log("-----------------------------------------");
    if (links.length === 0) {
      Logger.log("❌ No useful links found. The site might be using hidden JavaScript elements.");
    } else {
      Logger.log("✅ Found " + links.length + " unique links:");
      for (var i = 0; i < links.length; i++) {
        Logger.log((i+1) + ". " + links[i]);
      }
    }
    Logger.log("-----------------------------------------");
    
  } catch(e) {
    Logger.log("❌ Error accessing site! Details: " + e.toString());
  }
}

// ==========================================
// 7. QUICK TEST: SCORE REVEALER
// ==========================================
function runQuickScoreTest() {
  Logger.log("🧪 Starting Quick Score Test with a sample job posting...");
  
  if (!GEMINI_API_KEY) { Logger.log("ERROR: API Key not found!"); return; }
  
  var activeModel = getActiveModel(GEMINI_API_KEY);
  if (!activeModel) { Logger.log("ERROR: Model not found!"); return; }
  
  var myCvText = "";
  try { myCvText = DocumentApp.openById(CV_DOC_ID).getBody().getText(); } 
  catch(e) { Logger.log("ERROR: Failed to read CV."); return; }
  
  // A generic sample job text for testing purposes
  var testJobText = "Company X is currently looking for an enthusiastic professional to join our team. " +
                    "The ideal candidate will have strong analytical skills, experience working in dynamic environments, " +
                    "and a passion for continuous learning. Responsibilities include managing projects, collaborating with " +
                    "cross-functional teams, and driving innovative solutions. If you are a proactive problem solver " +
                    "with excellent communication skills, we encourage you to apply. Equal opportunity employer.";

  Logger.log("Sending the text to AI for evaluation...");
  var aiAnalysis = evaluateWithGemini(myCvText, testJobText, activeModel);
  
  Logger.log("================ AI VERDICT ================");
  if (aiAnalysis === "QUOTA_ERROR") {
    Logger.log("Quota Reached! Try again in a minute.");
  } else if (aiAnalysis) {
    Logger.log(JSON.stringify(aiAnalysis, null, 2)); // Prints the exact JSON response neatly
  } else {
    Logger.log("AI returned null. Something went wrong.");
  }
  Logger.log("============================================");
}
