
/* =========================================
   DEVAGYA — GLA UNIVERSITY STUDENT ASSISTANT
   Connected to the Express AI backend
   ========================================= */

document.addEventListener("DOMContentLoaded", function () {
    // 1. GET HTML ELEMENTS
    const chatLauncher = document.getElementById("chatLauncher");
    const chatWidget = document.getElementById("chatWidget");
    const closeChat = document.getElementById("closeChat");
    const clearChat = document.getElementById("clearChat");

    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatMessages = document.getElementById("chatMessages");
    const chatWelcome = document.getElementById("chatWelcome");
    const chatBody = document.getElementById("chatBody");
    const typing = document.getElementById("typing");

    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    const facultySearchForm =
        document.getElementById("facultySearchForm");
    const facultySearchInput =
        document.getElementById("facultySearchInput");
    const facultySearchResults =
        document.getElementById("facultySearchResults");

    let isSending = false;
    let chatContext = null; // remembers the last topic for follow-up questions

    const CLIENT_MESSAGES = {
        timeout: {
            en: "The server did not respond in time. Please try again.",
            hi: "सर्वर ने समय पर जवाब नहीं दिया। कृपया फिर से कोशिश करें।",
            hinglish: "Server ne time par jawab nahi diya. Dobara try karo."
        },
        offline: {
            en: "Could not reach the server. Check your internet and try again.",
            hi: "सर्वर से कनेक्ट नहीं हो पाया। इंटरनेट जाँचकर फिर से कोशिश करें।",
            hinglish: "Server se connect nahi ho paaya. Internet check karke dobara try karo."
        }
    };

    function clientMessage(key) {
        const lang = (chatContext && chatContext.lang) || "en";
        return CLIENT_MESSAGES[key][lang] || CLIENT_MESSAGES[key].en;
    }

    // 2. OPEN AND CLOSE CHAT
    function openChat() {
        if (!chatWidget) return;

        chatWidget.classList.add("active");
        chatWidget.setAttribute("aria-hidden", "false");

        if (chatLauncher) {
            chatLauncher.setAttribute("aria-expanded", "true");
        }

        window.setTimeout(function () {
            if (chatInput) chatInput.focus();
        }, 100);
    }

    function closeChatWindow() {
        if (!chatWidget) return;

        chatWidget.classList.remove("active");
        chatWidget.setAttribute("aria-hidden", "true");

        if (chatLauncher) {
            chatLauncher.setAttribute("aria-expanded", "false");
            chatLauncher.focus();
        }
    }

    if (chatLauncher) {
        chatLauncher.addEventListener("click", function () {
            if (chatWidget.classList.contains("active")) {
                closeChatWindow();
            } else {
                openChat();
            }
        });
    }

    if (closeChat) {
        closeChat.addEventListener("click", closeChatWindow);
    }

    // 3. MOBILE NAVIGATION
    function closeMobileMenu() {
        if (!mainNav || !menuToggle) return;

        mainNav.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
    }

    if (menuToggle && mainNav) {
        menuToggle.addEventListener("click", function () {
            const isOpen = mainNav.classList.toggle("active");

            menuToggle.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });

        mainNav.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", closeMobileMenu);
        });
    }

    // 4. OPEN CHAT FROM ANY BUTTON
    document.addEventListener("click", function (event) {
        const openButton = event.target.closest("[data-open-chat]");

        if (openButton) {
            openChat();
            closeMobileMenu();
        }
    });

    // 5. DISPLAY CHAT MESSAGES SAFELY
    function addMessage(message, sender, suggestions) {
        if (!chatMessages) return;

        const messageWrapper = document.createElement("div");
        messageWrapper.className = "message " + sender;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.textContent = String(message);

        const time = document.createElement("span");
        time.className = "message-time";

        time.textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        messageWrapper.append(bubble, time);

        // Clickable follow-up chips under the bot's answer.
        if (Array.isArray(suggestions) && suggestions.length) {
            const chips = document.createElement("div");
            chips.className = "suggestions";

            suggestions.slice(0, 3).forEach(function (text) {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.dataset.question = String(text);
                chip.textContent = String(text);
                chips.appendChild(chip);
            });

            messageWrapper.appendChild(chips);
        }

        chatMessages.appendChild(messageWrapper);

        if (chatWelcome) {
            chatWelcome.style.display = "none";
        }

        if (chatBody) {
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    }

    // 6. TYPING INDICATOR
    function showTyping(show) {
        if (typing) {
            typing.hidden = !show;
        }

        if (chatBody && show) {
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    }

    // 7. CONNECT TO THE BACKEND
    async function sendQuestion(question) {
        const cleanQuestion = String(question || "").trim();

        if (!cleanQuestion || isSending) return;

        if (cleanQuestion.length > 2000) {
            addMessage(
                "Please keep your question under 2000 characters.",
                "bot"
            );
            return;
        }

        isSending = true;

        openChat();

        // Remove old follow-up chips before the new exchange.
        if (chatMessages) {
            chatMessages.querySelectorAll(".suggestions").forEach(function (el) {
                el.remove();
            });
        }

        addMessage(cleanQuestion, "user");

        if (chatInput) {
            chatInput.value = "";
            chatInput.disabled = true;
        }

        const sendButton = document.getElementById("sendMessage");

        if (sendButton) {
            sendButton.disabled = true;
        }

        showTyping(true);

        try {
            // Never let the UI hang: give up after 20 seconds.
            const controller = new AbortController();
            const timer = window.setTimeout(function () {
                controller.abort();
            }, 20000);

            let response;
            try {
                response = await fetch("/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal: controller.signal,

                    // IMPORTANT: server.js expects "question"
                    body: JSON.stringify({
                        question: cleanQuestion,
                        context: chatContext
                    })
                });
            } catch (networkError) {
                throw new Error(
                    networkError.name === "AbortError"
                        ? clientMessage("timeout")
                        : clientMessage("offline")
                );
            } finally {
                window.clearTimeout(timer);
            }

            let data;

            try {
                data = await response.json();
            } catch {
                throw new Error(
                    "Server returned an invalid response. Please try again."
                );
            }

            if (!response.ok) {
                throw new Error(
                    data.answer ||
                    data.reply ||
                    "The AI service returned an error. Please try again."
                );
            }

            // IMPORTANT: server.js returns "answer"
            const answer = data.answer || data.reply;

            if (!answer) {
                throw new Error(
                    "The server did not return an answer. Check server.js."
                );
            }

            if (data.context) {
                chatContext = data.context;
            }

            addMessage(answer, "bot", data.suggestions);

        } catch (error) {
            console.error("Chat request failed:", error);

            addMessage(
                error.message ||
                "Unable to connect to the server. Check that node server.js is running.",
                "bot"
            );

        } finally {
            showTyping(false);
            isSending = false;

            if (chatInput) {
                chatInput.disabled = false;
                chatInput.focus();
            }

            if (sendButton) {
                sendButton.disabled = false;
            }
        }
    }

    // 8. SEND MESSAGE USING THE CHAT FORM
    if (chatForm) {
        chatForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!chatInput) return;

            sendQuestion(chatInput.value);
        });
    }

    // 9. QUICK QUESTION BUTTONS
    document.addEventListener("click", function (event) {
        const questionButton = event.target.closest("[data-question]");

        if (!questionButton) return;

        const question = questionButton.dataset.question;

        if (question) {
            sendQuestion(question);
        }
    });

    // 10. CLEAR CHAT
    if (clearChat) {
        clearChat.addEventListener("click", function () {
            if (chatMessages) {
                chatMessages.replaceChildren();
            }

            chatContext = null;

            if (chatWelcome) {
                chatWelcome.style.display = "";
            }

            showTyping(false);

            if (chatInput) {
                chatInput.value = "";
                chatInput.focus();
            }
        });
    }

    // 11. FACULTY CABIN FINDER
    // Faculty search currently uses the chat backend.
    if (facultySearchForm) {
        facultySearchForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!facultySearchInput) return;

            const query = facultySearchInput.value.trim();

            if (!query) return;

            sendQuestion(
                "Find the university faculty or teacher: " + query
            );
        });
    }

    // 12. CLOSE CHAT WITH ESCAPE
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeChatWindow();
            closeMobileMenu();
        }
    });

    // 13. INITIAL CHAT STATUS
    if (chatWidget) {
        chatWidget.classList.remove("active");
        chatWidget.setAttribute("aria-hidden", "true");
    }

    if (chatLauncher) {
        chatLauncher.setAttribute("aria-expanded", "false");
    }

    console.log("Devagya Student Assistant initialized.");
});
