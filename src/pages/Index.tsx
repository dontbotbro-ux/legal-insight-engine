import { motion } from "framer-motion";
import { ArrowRight, BookOpen, FileText, MessageSquare, Scale, Shield, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

const features = [
  {
    icon: FileText,
    title: "Document Intelligence",
    description: "Upload legal PDFs and extract parties, deadlines, and jurisdiction automatically.",
  },
  {
    icon: MessageSquare,
    title: "Citation-Aware Chat",
    description: "Every AI response is grounded with [Page X] citations from your documents.",
  },
  {
    icon: Shield,
    title: "Strict Grounding",
    description: "The AI only answers from your uploaded context, with no guesswork layered on top.",
  },
];

const Index = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container h-16 flex items-center gap-3 min-w-0">
          <div className="shrink-0">
            <Link to="/" className="flex items-center gap-2">
              <Scale className="h-6 w-6 text-gold" />
              <span className="font-serif text-xl font-bold text-foreground">LawyerBot</span>
            </Link>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex items-center gap-4 w-max ml-auto pr-1">
              <Link to="/dashboard">
                <Button variant="outline" size="sm">Dashboard</Button>
              </Link>
              <Link to="/repository">
                <Button variant="outline" size="sm">History</Button>
              </Link>
              {!user && <GoogleSignInButton compact />}
              {user && (
                <Button variant="outline" size="sm" onClick={signOut}>
                  Sign Out
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="gradient-navy relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-gold blur-[120px]" />
          <div className="absolute bottom-10 right-20 h-96 w-96 rounded-full bg-gold blur-[160px]" />
        </div>
        <div className="container relative py-28 lg:py-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5">
              <Zap className="h-3.5 w-3.5 text-gold" />
              <span className="text-sm font-medium text-gold">AI-Powered Legal Analysis</span>
            </div>
            <h1 className="mb-6 text-4xl font-bold leading-tight text-primary-foreground md:text-5xl lg:text-6xl">
              Case Analysis with
              <span className="block text-gold">Precision & Confidence</span>
            </h1>
            <p className="mb-10 max-w-2xl font-sans text-lg text-primary-foreground/70">
              Upload legal documents and get citation-grounded insights. Every claim traced to its source.
              No hallucinations. Only facts from your files.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/dashboard">
                <Button size="lg" className="gradient-gold font-semibold text-accent-foreground hover:opacity-90 transition-opacity">
                  Start Analyzing <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <BookOpen className="mr-2 h-4 w-4" /> View Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">Built for Legal Professionals</h2>
          <p className="mx-auto max-w-xl font-sans text-muted-foreground">
            High-precision retrieval-augmented generation designed for the legal industry.
          </p>
        </motion.div>
        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:border-gold/30 hover:shadow-lg"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-gold" />
              </div>
              <h3 className="mb-3 font-serif text-xl font-bold text-foreground">{feature.title}</h3>
              <p className="font-sans leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-card py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-gold" />
            <span className="font-serif font-semibold text-foreground">LawyerBot</span>
          </div>
          <span>© 2026 LawyerBot. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
