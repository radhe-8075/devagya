"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const api = async (path, options = {}) => {
    const response = await fetch("/api/smart-campus" + path, {
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
    return data;
  };
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const setMessage = (target, message, className = "d2-empty") => {
    if (!target) return;
    target.replaceChildren(make("p", className, message));
  };

  // Campus XP is intentionally local to this browser; no student profile is created.
  const xpKey = "devagya2-campus-xp";
  const readXp = () => {
    try {
      const value = JSON.parse(localStorage.getItem(xpKey) || "{}");
      return { total: Number(value.total) || 0, lastDay: value.lastDay || "" };
    } catch {
      return { total: 0, lastDay: "" };
    }
  };
  const drawXp = () => {
    const data = readXp();
    const level = Math.floor(data.total / 100) + 1;
    const names = ["Explorer", "Learner", "Builder", "Innovator", "Campus Champion"];
    const name = names[Math.min(level - 1, names.length - 1)];
    $("d2XpTotal").textContent = data.total + " XP";
    $("d2XpLevel").textContent = "Level " + level + " · " + name;
    $("d2XpBar").style.width = (data.total % 100) + "%";
  };
  const awardXp = points => {
    const data = readXp();
    const today = new Date().toLocaleDateString("en-CA");
    if (data.lastDay === today) {
      $("d2XpMessage").textContent = "You have already logged an XP activity today. Come back tomorrow for another daily activity.";
      return;
    }
    data.total += points;
    data.lastDay = today;
    try {
      localStorage.setItem(xpKey, JSON.stringify(data));
      $("d2XpMessage").textContent = "Great work! +" + points + " XP added on this device.";
    } catch {
      $("d2XpMessage").textContent = "Browser storage is unavailable. Your XP could not be saved.";
    }
    drawXp();
  };
  if ($("d2StudyXp")) $("d2StudyXp").addEventListener("click", () => awardXp(20));
  if ($("d2ProjectXp")) $("d2ProjectXp").addEventListener("click", () => awardXp(30));
  drawXp();

  // Career Navigator
  if ($("d2CareerForm")) $("d2CareerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const result = $("d2CareerResult");
    setMessage(result, "Building your learning roadmap…");
    try {
      const data = await api("/career/plan", {
        method: "POST",
        body: JSON.stringify({
          goal: $("d2CareerGoal").value,
          skills: $("d2CareerSkills").value.split(",").map(item => item.trim()).filter(Boolean)
        })
      });
      result.replaceChildren();
      const gap = make("div", "d2-item");
      gap.append(make("strong", "", "Skills to explore next"));
      gap.append(make("small", "", data.skillGap.length ? data.skillGap.join(" · ") : "Your listed skills cover the suggested foundations."));
      result.append(gap);
      data.stages.forEach(stage => {
        const card = make("div", "d2-item");
        card.append(make("strong", "", "Stage " + stage.step + " · " + stage.title));
        card.append(make("small", "", "Skills: " + stage.skills));
        card.append(make("p", "", "Project: " + stage.project));
        result.append(card);
      });
      result.append(make("p", "d2-notice", data.disclaimer));
    } catch (error) {
      setMessage(result, error.message);
    }
  });

  // Campus Radar
  async function loadRadar() {
    const list = $("d2RadarList");
    setMessage(list, "Loading sample opportunities…");
    try {
      const category = encodeURIComponent($("d2RadarFilter").value);
      const data = await api("/radar?category=" + category);
      list.replaceChildren();
      if (!data.items.length) {
        setMessage(list, "No sample items in this category yet.");
        return;
      }
      data.items.forEach(item => {
        const card = make("div", "d2-item");
        card.append(make("strong", "", item.title));
        card.append(make("span", "d2-chip", item.category));
        card.append(make("small", "", item.mode + " · " + item.eligibility));
        card.append(make("small", "", "Deadline: " + item.deadline));
        card.append(make("p", "d2-notice", item.source));
        list.append(card);
      });
    } catch (error) {
      setMessage(list, error.message);
    }
  }
  if ($("d2RadarFilter")) $("d2RadarFilter").addEventListener("change", loadRadar);
  loadRadar();

  // Find My Team — fictional examples only; no public student sign-up is enabled.
  if ($("d2TeamForm")) $("d2TeamForm").addEventListener("submit", async event => {
    event.preventDefault();
    const list = $("d2TeamList");
    setMessage(list, "Finding sample matches…");
    try {
      const skills = encodeURIComponent($("d2TeamSkills").value);
      const data = await api("/teams?skills=" + skills);
      list.replaceChildren();
      data.people.forEach(person => {
        const card = make("div", "d2-item");
        card.append(make("strong", "", person.alias + " · " + person.matchScore + "% skill overlap"));
        card.append(make("small", "", "Skills: " + person.skills.join(", ")));
        card.append(make("small", "", "Interests: " + person.interests.join(", ") + " · " + person.availability));
        card.append(make("span", "d2-chip", "Fictional demo profile"));
        list.append(card);
      });
      list.append(make("p", "d2-notice", data.notice));
    } catch (error) {
      setMessage(list, error.message);
    }
  });

  // StudyMate AI
  if ($("d2StudyForm")) $("d2StudyForm").addEventListener("submit", async event => {
    event.preventDefault();
    const output = $("d2StudyResult");
    output.replaceChildren(make("small", "", "StudyMate is preparing your response…"));
    try {
      const data = await api("/study/assist", {
        method: "POST",
        body: JSON.stringify({
          topic: $("d2StudyTopic").value,
          mode: $("d2StudyMode").value,
          level: "university beginner"
        })
      });
      output.replaceChildren(make("p", "", data.answer));
    } catch (error) {
      output.replaceChildren(make("p", "", error.message));
      output.append(make("small", "", "Configure OPENAI_API_KEY in the server environment to enable generated study assistance."));
    }
  });

  // Campus directory deliberately remains empty until verified records are supplied.
  api("/directory").then(data => setMessage($("d2DirectoryResult"), data.notice)).catch(error => setMessage($("d2DirectoryResult"), error.message));

  // Integration health indicators
  api("/meta").then(data => {
    $("d2SystemStatus").textContent = "Smart Campus API · " + data.version;
    const list = $("d2IntegrationStatus");
    list.replaceChildren();
    const rows = [
      ["AI StudyMate", data.aiStudyEnabled ? "Configured" : "Needs OPENAI_API_KEY"],
      ["n8n automation", data.n8nEnabled ? "Webhook configured" : "Not configured"],
      ["Database", data.databaseEnabled ? "Connection variable present" : "Not configured"],
      ["Student sign-in", "Not enabled"]
    ];
    rows.forEach(row => {
      const item = make("div", "d2-item");
      item.append(make("strong", "", row[0]));
      item.append(make("small", "", row[1]));
      list.append(item);
    });
  }).catch(() => {
    $("d2SystemStatus").textContent = "Smart Campus API unavailable";
    setMessage($("d2IntegrationStatus"), "Could not read integration status.");
  });

  console.log("Devagya 2.0 Smart Campus modules initialized.");
});
