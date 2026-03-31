// ==========================================
// AI_JOB_HUNTER - AUTONOMOUS HR ASSISTANT
// ==========================================

// --- USER SETTINGS ---
var CV_DOC_ID = "YOUR_GOOGLE_DOC_CV_ID_HERE";
var SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE"; 
var LABEL_NAME = "job_search_scanning"; 
var MIN_MATCH_SCORE = 65; 

var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

// --- MAIN FUNCTION: EMAIL SCANNER ---
function runEmailScanner() {
  Logger.log("🚀 AI Job Hunter: Starting Email Scan...");
  
  if (!GEMINI_API_KEY) { Logger.log("ERROR: API Key not found!"); return; }
  
  var activeModel = getActiveModel(GEMINI_API_KEY);
  if (!activeModel) { Logger.log("ERROR: Model not found!"); return; }
  
  var myCvText = "";
  try { myCvText = DocumentApp.openById(CV_DOC_ID).getBody().getText(); } 
  catch(e) { Logger.log("ERROR: Failed to read CV. Check ID."); return; }
  
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) { Logger.log("ERROR: Gmail Label not found."); return; }
  
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
          var subMessages = body.split(/-{30,}/);
          
          for (var i = 1; i < subMessages.length; i++) {
            var jobText = subMessages[i].trim();
            // Remove email headers
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
                
                sheet.appendRow([date, aiAnalysis.score + "%", actualTitle, aiAnalysis.reason, shortSummary, threadLink]);
              }
              Utilities.sleep(6000); // Prevent quota limits
            }
          }
        } 
      });
      processedCount++;
    }
  });
  Logger.log("🎉 Email Scan Completed.");
}

// --- HELPER: GET AVAILABLE GEMINI MODEL ---
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

// --- HELPER: GEMINI API CALL ---
function evaluateWithGemini(cvText, jobText, modelName) {
  var url = "https://generativelanguage.googleapis.com/v1beta/" + modelName + ":generateContent?key=" + GEMINI_API_KEY;
  
  var prompt = "You are an expert HR ATS AI. Read the following Job Posting text and compare it with the Candidate CV. " +
               "CRITICAL RULE: The candidate has graduated. If the job is strictly for active students (e.g., 'Student', 'Studentische Hilfskraft'), " +
               "or if it is 'volunteer', 'unpaid', or an 'unpaid internship', you MUST assign a score of 0.\n\n" +
               "Return ONLY a valid JSON object with EXACTLY these four keys:\n" +
               "1. 'score': integer from 0 to 100 (match percentage).\n" +
               "2. 'reason': 2-sentence explanation of the score.\n" +
               "3. 'job_title': Extract the ACTUAL specific Job Title and Company from the text.\n" +
               "4. 'summary': Write a very short, 1-sentence crisp summary of the role.\n\n" +
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

// --- NIGHT WATCHMAN: RESET TABLE ---
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
// 🕸️ WEB SPIDER (SCRAPER)
// ==========================================

function runWebSpider() {
  Logger.log("🕸️ Web Spider Starting...");
  
  var activeModel = getActiveModel(GEMINI_API_KEY);
  if (!activeModel) { Logger.log("ERROR: Model not found!"); return; }
  
  var myCvText = "";
  try { myCvText = DocumentApp.openById(CV_DOC_ID).getBody().getText(); } 
  catch(e) { Logger.log("ERROR: Failed to read CV."); return; }
  
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  
 // --- TARGET LIST (Add your target career sites here) ---
  var targets = [
    {
      name: "Company A",
      listUrl: "https://jobs.companya.com/search/special_filters",
      baseUrl: "https://jobs.companya.com",
      regex: /href="(\/job\/[^"]+)"/g  // For relative URLs (e.g., /job/12345)
    },
    {
      name: "Company B",
      listUrl: "https://jobs.companyb.com/en_US/special_filters",
      baseUrl: "", 
      regex: /href="(https:\/\/jobs\.companyb\.com\/[^"]+\/JobDetail\/[^"]+)"/gi // For absolute URLs
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
        
        // Strip HTML tags and scripts
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
              
              sheet.appendRow([today, aiAnalysis.score + "%", actualTitle, aiAnalysis.reason, shortSummary, link]);
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
