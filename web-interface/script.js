// Simple markdown parser using marked.js
import { marked } from '../publicvendor/marked/marked.min.js';

const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const chatForm = document.getElementById("chat-form");
const welcomeHero = document.getElementById("welcome-hero");
const welcomeCards = document.getElementById("welcome-cards");
const settingsBtn = document.getElementById("settings-btn");
const userProfileBtn = document.getElementById("user-profile-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettingsBtn = document.getElementById("close-settings");
const userMenu = document.getElementById("user-menu");
const signInSection = document.getElementById("sign-in-section");
const signInBtn = document.getElementById("sign-in-btn");

let messages = [];
let isUserSignedIn = false; // Toggle this to test signed in/out states

// Initialize the app
function init() {
    setupEventListeners();
    updateUserInterface();
    showWelcomeView();
}

// Set up event listeners
function setupEventListeners() {
    // Chat form submission
    if (chatForm) {
        chatForm.addEventListener("submit", handleChatSubmit);
    }

    // Settings button
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            settingsModal.classList.remove("hidden");
        });
    }

    // Close settings modal
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener("click", () => {
            settingsModal.classList.add("hidden");
        });
    }

    // User profile button
    if (userProfileBtn) {
        userProfileBtn.addEventListener("click", toggleUserMenu);
    }

    // Sign in button
    if (signInBtn) {
        signInBtn.addEventListener("click", () => {
            alert("Sign In functionality not implemented yet.");
        });
    }

    // Close user menu when clicking outside
    document.addEventListener("click", (e) => {
        if (!userProfileBtn.contains(e.target) && !userMenu.contains(e.target)) {
            userMenu.classList.add("hidden");
        }
    });

    // User menu items
    document.querySelectorAll(".user-menu-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const action = e.target.dataset.action;
            handleUserMenuAction(action);
        });
    });

    // Welcome cards
    document.querySelectorAll(".welcome-card").forEach(card => {
        card.addEventListener("click", (e) => {
            const prompt = e.target.closest(".welcome-card").dataset.prompt;
            if (chatInput) {
                chatInput.value = prompt;
                chatInput.focus();
            }
        });
    });
}

// Handle chat form submission
function handleChatSubmit(e) {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage("user", message);
    chatInput.value = "";

    // Hide welcome view
    hideWelcomeView();

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
        const response = "This is a simulated response. Markdown rendering is working! **Bold text**, *italic text*, `code`, and more.";
        addMessage("assistant", response);
    }, 1000);
}

// Add a message to the chat
function addMessage(role, content) {
    const message = { role, content, timestamp: new Date() };
    messages.push(message);
    renderMessage(message);
    scrollToBottom();
}

// Render a message in the chat box
function renderMessage(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-bubble ${message.role}-bubble`;

    // Render markdown for assistant messages, plain text for user
    if (message.role === "assistant") {
        messageDiv.innerHTML = marked.parse(message.content);
    } else {
        messageDiv.textContent = message.content;
    }

    chatBox.appendChild(messageDiv);
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Show welcome view
function showWelcomeView() {
    welcomeHero.style.display = "block";
    welcomeCards.style.display = "block";
}

// Hide welcome view
function hideWelcomeView() {
    welcomeHero.style.display = "none";
    welcomeCards.style.display = "none";
}

// Toggle user menu
function toggleUserMenu() {
    userMenu.classList.toggle("hidden");
}

// Handle user menu actions
function handleUserMenuAction(action) {
    switch (action) {
        case "profile":
            alert("Profile functionality not implemented yet.");
            break;
        case "subscriptions":
            alert("Subscriptions functionality not implemented yet.");
            break;
        case "sign-out":
            alert("Sign Out functionality not implemented yet.");
            break;
    }
    userMenu.classList.add("hidden");
}

// Update user interface based on sign-in status
function updateUserInterface() {
    if (isUserSignedIn) {
        userProfileBtn.style.display = "flex";
        signInSection.classList.add("hidden");
    } else {
        userProfileBtn.style.display = "none";
        signInSection.classList.remove("hidden");
    }
}

// Toggle sign-in status for testing
window.toggleSignIn = function() {
    isUserSignedIn = !isUserSignedIn;
    updateUserInterface();
};

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", init);
