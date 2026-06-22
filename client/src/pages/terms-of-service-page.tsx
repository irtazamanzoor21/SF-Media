import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/home">
          <Button variant="ghost" className="mb-8 gap-2" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Terms of Service</h1>
        <p className="text-muted-foreground mb-2" data-testid="text-last-updated">Last updated: February 27, 2026</p>
        <p className="text-muted-foreground mb-8" data-testid="text-app-identity">
          These terms apply to SF Media, operated at{" "}
          <a href="https://springpost.buildingagents.ai" className="text-primary hover:underline">springpost.buildingagents.ai</a>.
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using SF Media, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing SF Media.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media is an AI-powered social media campaign platform that helps businesses and content creators generate on-brand social media content, manage campaigns, and schedule posts across multiple platforms. The service includes brand voice analysis, AI content generation, media library management, and calendar scheduling.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Use License</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media grants you a limited, non-exclusive, non-transferable, and revocable license to use the platform for your personal or business purposes, subject to these Terms of Service. This license does not include the right to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Modify or copy SF Media's materials</li>
              <li>Use the materials for any commercial purpose outside the platform's intended use</li>
              <li>Attempt to decompile or reverse engineer any software contained on the platform</li>
              <li>Remove any copyright or proprietary notations from the materials</li>
              <li>Transfer the materials to another person or mirror them on any other server</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you create an account with SF Media, you must provide accurate, complete, and current information. You are responsible for safeguarding the password that you use to access SF Media and for any activities or actions under your account. You agree not to share your account credentials with any third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. User Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media allows you to create, upload, and share content including social media posts, images, and brand documents. You retain ownership of any intellectual property rights that you hold in that content. By uploading content to SF Media, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, and display such content solely for the purpose of providing and improving our services to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Third-Party Integrations</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media integrates with third-party services including Google (for authentication and Google Drive file import) and Google Gemini (for content generation and image generation). Your use of these third-party services through SF Media is subject to those services' respective terms and privacy policies. SF Media is not responsible for the practices of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Prohibited Activities</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to engage in any of the following prohibited activities:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Using SF Media for any unlawful purpose or in violation of any applicable laws</li>
              <li>Harassing, abusing, or threatening other users</li>
              <li>Uploading or transmitting viruses, malware, or other harmful code</li>
              <li>Attempting to gain unauthorized access to any part of SF Media</li>
              <li>Interfering with or disrupting the platform or its servers</li>
              <li>Scraping or collecting user data without consent</li>
              <li>Using AI-generated content to mislead, deceive, or impersonate others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media may terminate or suspend your account immediately, without prior notice or liability, for any reason, including without limitation if you breach these Terms of Service. Upon termination, your right to use SF Media will cease immediately. You may also request account deletion at any time by contacting us at{" "}
              <a href="mailto:info@springpost.buildingagents.ai" className="text-primary hover:underline">info@springpost.buildingagents.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall SF Media be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of, or inability to access or use, SF Media.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media is provided on an "as is" and "as available" basis. SF Media makes no warranties, expressed or implied, and hereby disclaims all warranties, including without limitation implied warranties of merchantability, fitness for a particular purpose, and non-infringement. AI-generated content is provided as a starting point and should be reviewed before publishing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to conflict of law provisions. Any disputes arising under or in connection with these Terms shall be subject to the exclusive jurisdiction of the applicable courts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              SF Media reserves the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use SF Media after those revisions become effective, you agree to be bound by the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Service, please contact SF Media at:
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
