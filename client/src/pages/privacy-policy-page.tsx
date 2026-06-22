import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home">
          <Button variant="ghost" className="mb-8 gap-2" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Privacy Policy</h1>
        <p className="text-muted-foreground mb-2" data-testid="text-last-updated">Last updated: February 27, 2026</p>
        <p className="text-muted-foreground mb-8" data-testid="text-app-identity">
          This privacy policy applies to SF Media, operated at{" "}
          <a href="https://springpost.buildingagents.ai" className="text-primary hover:underline">springpost.buildingagents.ai</a>.
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to SF Media. We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how SF Media collects, uses, discloses, and safeguards your information when you use our service at springpost.buildingagents.ai.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media collects information that you provide directly to us, including but not limited to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Name and contact information (email address)</li>
              <li>Account credentials (password or Google OAuth authentication)</li>
              <li>Profile information and brand preferences</li>
              <li>Content you create, upload, or share through SF Media, including campaign posts and media files</li>
              <li>Brand documents and website URLs you provide for brand voice analysis</li>
              <li>Communications you send to us</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media uses the information we collect to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Provide, maintain, and improve our services, including AI-powered brand voice analysis and content generation</li>
              <li>Process your account registration and manage your user account</li>
              <li>Generate social media campaigns and content tailored to your brand</li>
              <li>Store and manage your media assets in your media library</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze trends, usage, and activities to improve user experience</li>
              <li>Detect, investigate, and prevent fraudulent or unauthorized activity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Google API Services &mdash; User Data Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media integrates with Google services to enhance your experience. This section describes how we handle data obtained through Google APIs.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Google Sign-In</h3>
            <p className="text-muted-foreground leading-relaxed">
              SF Media uses Google OAuth 2.0 for authentication. When you sign in with Google, we access your basic profile information (name and email address) solely to create and manage your SF Media account. We do not access any other Google account data through the sign-in process.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Google Drive Integration</h3>
            <p className="text-muted-foreground leading-relaxed">
              SF Media provides an optional Google Drive integration that allows you to import files from your Google Drive into your SF Media media library. When you use this feature:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><strong>What we access:</strong> Only the specific files you explicitly select for import from your Google Drive. We do not browse, scan, or access any other files in your Google Drive.</li>
              <li><strong>How we use it:</strong> Selected files are imported into your SF Media media library for use in your social media campaigns. Files are stored securely in our cloud storage.</li>
              <li><strong>What we do not do:</strong> We do not sell, share, or transfer your Google Drive data to any third parties. We do not use your Google Drive data for advertising, analytics, or any purpose other than the functionality you explicitly request.</li>
              <li><strong>Revoking access:</strong> You can revoke SF Media's access to your Google Drive at any time through your Google Account permissions at <a href="https://myaccount.google.com/permissions" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 Compliance with Google API Services User Data Policy</h3>
            <p className="text-muted-foreground leading-relaxed">
              SF Media's use and transfer to any other app of information received from Google APIs will adhere to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. We limit our use of Google user data to providing and improving user-facing features that are visible and prominent in SF Media's user interface.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Information Sharing</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media does not sell, trade, or otherwise transfer your personal information to outside parties except as described in this policy. We may share your information with trusted third-party service providers who assist us in operating SF Media, including:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Cloud hosting and storage providers for securely hosting the application and your data</li>
              <li>AI service providers (Google Gemini) for generating content and images based on your requests</li>
              <li>Image storage providers (Cloudinary) for storing AI-generated images</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              These providers are contractually obligated to keep your information confidential and use it only for the purposes of providing services to SF Media.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media implements appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encrypted data transmission (HTTPS/TLS), hashed passwords, and secure session management. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data Retention and Deletion</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media retains your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us at{" "}
              <a href="mailto:info@springpost.buildingagents.ai" className="text-primary hover:underline">info@springpost.buildingagents.ai</a>.
              Upon receiving a deletion request, we will delete your personal information within 30 days, except where we are required to retain it by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your location, you may have certain rights regarding your personal information, including the right to access, correct, delete, or port your data. You may also have the right to opt out of certain processing activities. To exercise any of these rights, please contact us at{" "}
              <a href="mailto:info@springpost.buildingagents.ai" className="text-primary hover:underline">info@springpost.buildingagents.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media uses cookies and similar tracking technologies to maintain your session and remember your preferences. These are essential cookies required for the platform to function. We do not use cookies for advertising or third-party tracking purposes. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent, but this may prevent you from using SF Media.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy or your personal data, please contact SF Media at:
            </p>
            <p className="text-muted-foreground mt-2">
              <strong>Email:</strong>{" "}
              <a href="mailto:info@springpost.buildingagents.ai" className="text-primary hover:underline">info@springpost.buildingagents.ai</a>
            </p>
            <p className="text-muted-foreground mt-1">
              <strong>Website:</strong>{" "}
              <a href="https://springpost.buildingagents.ai" className="text-primary hover:underline">springpost.buildingagents.ai</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
