const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/guzanbermeo/";

function stripHtml(input) {
  const doc = new DOMParser().parseFromString(input || "", "text/html");
  return (doc.body.textContent || "").trim();
}

function truncate(text, max = 150) {
  if (!text) return "Deskribapena Instagramen irakurri.";
  return text.length <= max ? text : text.slice(0, max - 1).trim() + "...";
}

function fallbackPosts() {
  return [
    {
      title: "11 urte! GUZANDA EZAN DA!! Talan 12dxetan batun gaitzezen, Bermion 3.",
      link: "https://www.instagram.com/reel/Dbtex--IU2p/",
      thumbnail: "./assets/images/instagram-1.jpg"
    },
    {
      title: "EtxebiItzie Guzanen ardatz bat ezan da 2015etik! Berton lan eta bizi!",
      link: "https://www.instagram.com/reel/Dbdj1XAI8-g/",
      thumbnail: "./assets/images/instagram-2.jpg"
    },
    {
      title: "Astie ondo hasteko erdu geugaz tokiko garapen ekonomikuen inguruen berbetan.",
      link: "https://www.instagram.com/p/DbRAR7foMeD/",
      thumbnail: "./assets/images/instagram-3.jpg"
    }
  ];
}

function toPost(post, i) {
  const title = truncate(stripHtml(post.title) || ("Instagram posta " + (i + 1)), 100);
  return {
    title,
    link: safeInstagramLink(post.link),
    thumbnail: safeImageUrl(post.thumbnail, "./assets/images/instagram-" + (i + 1) + ".jpg")
  };
}

function safeInstagramLink(value) {
  try {
    const url = new URL(value || INSTAGRAM_PROFILE_URL, window.location.href);
    if (url.protocol === "https:" && /(^|\.)instagram\.com$/i.test(url.hostname)) {
      return url.href;
    }
  } catch (_) {
    // Use the known-good profile URL below.
  }
  return INSTAGRAM_PROFILE_URL;
}

function safeImageUrl(value, fallback) {
  try {
    const url = new URL(value || fallback, window.location.href);
    if (url.protocol === "https:" || url.origin === window.location.origin) {
      return url.href;
    }
  } catch (_) {
    // Use the local image below.
  }
  return fallback;
}

function renderPosts(posts) {
  const target = document.getElementById("instagram-posts");
  if (!target) return;

  const fragment = document.createDocumentFragment();
  posts.forEach((post, i) => {
    const card = document.createElement("article");
    card.className = "card";

    const image = document.createElement("img");
    image.src = safeImageUrl(post.thumbnail, "./assets/images/instagram-" + (i + 1) + ".jpg");
    image.alt = "Instagram posta " + (i + 1);

    const title = document.createElement("h3");
    title.textContent = post.title;

    const link = document.createElement("a");
    link.href = safeInstagramLink(post.link);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Posta ikusi";

    card.append(image, title, link);
    fragment.append(card);
  });
  target.replaceChildren(fragment);
}

function renderError() {
  // Intentionally silent fallback: render cards only.
}

async function loadInstagramPosts() {
  try {
    const response = await fetch("/api/instagram", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Bad response");
    const payload = await response.json();
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 3) : [];
    if (!posts.length) throw new Error("No items");
    renderPosts(posts.map(toPost));
  } catch (_) {
    renderPosts(fallbackPosts());
    renderError();
  }
}

window.addEventListener("DOMContentLoaded", loadInstagramPosts);
