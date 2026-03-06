import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Scale, FileText, MessageSquare, Shield, ArrowRight, Zap, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
<<<<<<< HEAD
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useAuth } from "@/lib/auth";
=======
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c

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
    description: "The AI only answers from your uploaded context — no hallucinations, no guesswork.",
  },
];

const Index = () => {
<<<<<<< HEAD
  const { user, signOut } = useAuth();

=======
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
<<<<<<< HEAD
        <div className="container h-16 flex items-center gap-3 min-w-0">
          <div className="shrink-0">
=======
        <div className="container flex h-16 items-center justify-between">
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
          <Link to="/" className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-gold" />
            <span className="font-serif text-xl font-bold text-foreground">LawyerBot</span>
          </Link>
<<<<<<< HEAD
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
=======
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-navy-light">
                Get Started
              </Button>
            </Link>
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="gradient-navy relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-gold blur-[120px]" />
          <div className="absolute bottom-10 right-20 w-96 h-96 rounded-full bg-gold blur-[160px]" />
        </div>
        <div className="container relative py-28 lg:py-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 mb-6">
              <Zap className="h-3.5 w-3.5 text-gold" />
              <span className="text-sm font-medium text-gold">AI-Powered Legal Analysis</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6">
              Case Analysis with
              <span className="text-gold block">Precision & Confidence</span>
            </h1>
            <p className="text-lg text-primary-foreground/70 max-w-2xl mb-10 font-sans">
              Upload legal documents and get citation-grounded insights. Every claim traced to its source. No hallucinations — only facts from your files.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/dashboard">
                <Button size="lg" className="gradient-gold text-accent-foreground font-semibold hover:opacity-90 transition-opacity">
                  Start Analyzing <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
<<<<<<< HEAD
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
=======
              <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
>>>>>>> f3f772e51a1bb0edb326720cb816f9bf0af3f95c
                <BookOpen className="mr-2 h-4 w-4" /> View Demo
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Built for Legal Professionals</h2>
          <p className="text-muted-foreground max-w-xl mx-auto font-sans">
            High-precision retrieval-augmented generation designed for the legal industry.
          </p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="rounded-xl border border-border bg-card p-8 hover:shadow-lg hover:border-gold/30 transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-5">
                <f.icon className="h-6 w-6 text-gold" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 font-serif">{f.title}</h3>
              <p className="text-muted-foreground font-sans leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
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
