import { createProvider } from "./providers/registry.js";
import { resolveGeminiModel } from "./models.js";

async function addReaction(token: string, repository: string, commentType: string, commentId: string, content: "eyes" | "rocket" | "+1") {
  try {
    const endpoint = commentType === "pull_request_review_comment"
      ? `https://api.github.com/repos/${repository}/pulls/comments/${commentId}/reactions`
      : `https://api.github.com/repos/${repository}/issues/comments/${commentId}/reactions`;

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.warn("Could not add reaction to comment:", err);
  }
}

async function postReply(token: string, repository: string, prNumber: string, commentType: string, commentId: string, body: string) {
  if (commentType === "pull_request_review_comment") {
    const res = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments/${commentId}/replies`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body })
    });
    if (!res.ok) {
      console.warn("Could not reply to review comment:", await res.text());
    }
  } else {
    const res = await fetch(`https://api.github.com/repos/${repository}/issues/${prNumber}/comments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body })
    });
    if (!res.ok) {
      console.warn("Could not post issue comment:", await res.text());
    }
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const commentBody = (process.env.COMMENT_BODY || "").trim();
  const commentId = process.env.COMMENT_ID;
  const commentType = process.env.COMMENT_TYPE || "issue_comment";
  const filePath = process.env.COMMENT_PATH;
  const diffHunk = process.env.DIFF_HUNK;
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.AI_MODEL || "gemini-3.8-flash";

  if (!token || !repository || !prNumber || !commentId || !commentBody) {
    console.log("Missing comment context; skipping interactive command.");
    return;
  }

  // 1. Handle /review command
  if (commentBody.startsWith("/review")) {
    console.log("Received /review command.");
    await addReaction(token, repository, commentType, commentId, "rocket");
    await postReply(
      token,
      repository,
      prNumber,
      commentType,
      commentId,
      "🚀 **Triggering PR Re-review**: Starting a fresh review run on the latest changes."
    );
    return;
  }

  // 2. Handle /ask command
  if (commentBody.startsWith("/ask")) {
    const question = commentBody.replace(/^\/ask\s*/i, "").trim();
    if (!question) {
      await postReply(
        token,
        repository,
        prNumber,
        commentType,
        commentId,
        "💡 Please include a question after `/ask`. For example: `/ask How does this method handle null values?`"
      );
      return;
    }

    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set; cannot answer /ask question.");
      return;
    }

    await addReaction(token, repository, commentType, commentId, "eyes");

    const chosenModel = await resolveGeminiModel(apiKey, { deep: false, explicitModel: model });
    const provider = createProvider("gemini", { apiKey, model: chosenModel });

    let codeContext = "";
    if (commentType === "pull_request_review_comment" && filePath) {
      codeContext = `File: ${filePath}\nDiff Hunk:\n\`\`\`\n${diffHunk || "No diff hunk available."}\n\`\`\``;
    } else {
      codeContext = `PR #${prNumber} on ${repository}`;
    }

    const systemPrompt = `You are a helpful, expert senior software engineer assisting a developer with a pull request review.
Provide a clear, accurate, and concise answer to their question. If proposing code fixes, use markdown code blocks.`;

    const userPrompt = `Context:
${codeContext}

Developer Question:
"${question}"

Answer:`;

    try {
      const response = await provider.review({
        system: systemPrompt,
        context: userPrompt
      });

      const replyText = commentType === "pull_request_review_comment"
        ? `🤖 **AI Response:**\n\n${response}`
        : `> /ask ${question}\n\n🤖 **AI Response:**\n\n${response}`;

      await postReply(token, repository, prNumber, commentType, commentId, replyText);
      console.log("Answered /ask command successfully.");
    } catch (err) {
      console.error("Failed to answer /ask:", err);
      await postReply(
        token,
        repository,
        prNumber,
        commentType,
        commentId,
        "⚠️ Sorry, I encountered an issue generating an answer. Please check the workflow logs."
      );
    }
  }
}

main().catch(error => {
  console.error("Error running PR command handler:", error);
  process.exit(1);
});
