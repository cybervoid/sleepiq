const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const BUCKET = process.env.SESSION_BUCKET_NAME;

if (!BUCKET) {
  console.warn("SESSION_BUCKET_NAME is not set; S3 session manager will not function.");
}

const s3 = new S3Client({ region: REGION });

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

class S3SessionManager {
  constructor(username) {
    if (!username) throw new Error("S3SessionManager requires a username");
    this.username = username;
    this.key = `sessions/${username}.json`;
    this.bucket = BUCKET;
  }

  async exists() {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404) return false;
      return false;
    }
  }

  async loadSession() {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key }));
      const body = await streamToString(res.Body);
      return JSON.parse(body);
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
        return null;
      }
      console.error("Error loading session from S3:", err);
      return null;
    }
  }

  async saveSession(sessionObj) {
    try {
      const Body = Buffer.from(JSON.stringify(sessionObj));
      await s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body,
        ContentType: "application/json",
        ServerSideEncryption: "AES256"
      }));
      return true;
    } catch (err) {
      console.error("Error saving session to S3:", err);
      return false;
    }
  }

  async clearSession() {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404) return true;
      console.error("Error clearing session in S3:", err);
      return false;
    }
  }
}

module.exports = { S3SessionManager };
