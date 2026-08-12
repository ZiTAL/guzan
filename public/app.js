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
      title: "Gaur Gerniken egon gara Bonbardeaketien 89. Urteurrenien",
      description: "Eskerrik asko gonbidapenagaitxik. Bakie eta adiskidetzea aldarrikatzen dituen mezua.",
      link: "https://www.instagram.com/p/DXm8b1UCBHa/",
      thumbnail: "./assets/images/instagram-1.jpg"
    },
    {
      title: "Azken Posta #2",
      description: "Post honetako testua estekan ikus dezakezu osorik.",
      link: "https://www.instagram.com/p/DWejCXliHbY/",
      thumbnail: "./assets/images/instagram-2.jpg"
    },
    {
      title: "Irrintzi zahar bat aho gaztetan",
      description: "Gailur berrietan, euskerie ardatz duen mezua. Aupa Korrika.",
      link: "https://www.instagram.com/p/DWVwABXiI1k/",
      thumbnail: "./assets/images/instagram-3.jpg"
    }
  ];
}

function toPost(post, i) {
  const title = stripHtml(post.title) || truncate(post.description, 80) || ("Instagram posta " + (i + 1));
  return {
    title,
    description: truncate(post.description, 170),
    link: post.link || INSTAGRAM_PROFILE_URL,
    thumbnail: post.thumbnail || "./assets/images/instagram-" + (i + 1) + ".jpg"
  };
}

function renderPosts(posts) {
  const target = document.getElementById("instagram-posts");
  if (!target) return;

  target.innerHTML = posts.map((post, i) =>
    '<article class="card">' +
      '<img src="' + post.thumbnail + '" alt="Instagram posta ' + (i + 1) + '">' +
      "<h3>" + post.title + "</h3>" +
      "<p>" + post.description + "</p>" +
      '<a href="' + post.link + '" target="_blank" rel="noopener">Posta ikusi</a>' +
    "</article>"
  ).join("");
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
