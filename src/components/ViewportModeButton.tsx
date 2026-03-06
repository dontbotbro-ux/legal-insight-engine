import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewportMode } from "@/hooks/use-mobile";

const ViewportModeButton = () => {
  const { isMobile, toggleMode } = useViewportMode();

  return (
    <div className="fixed bottom-3 right-3 z-[70]">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-full bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm"
        onClick={toggleMode}
      >
        {isMobile ? <Monitor className="h-3.5 w-3.5 mr-1.5" /> : <Smartphone className="h-3.5 w-3.5 mr-1.5" />}
        {isMobile ? "Web View" : "Mobile View"}
      </Button>
    </div>
  );
};

export default ViewportModeButton;
