import React from 'react';
import {
  Globe,
  FileText,
  PlaySquare,
  FormInput,
  Search,
  Sparkles,
} from 'lucide-react';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  currentPageTitle?: string;
}

interface ExamplePrompt {
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
  currentPageTitle,
}) => {
  const examplePrompts: ExamplePrompt[] = [
    {
      icon: <Globe className="w-4 h-4 text-violet-400" />,
      title: 'Explain this website',
      description: 'Analyze current website purpose and functionality',
      prompt: 'Explain what this website does and its main purpose.',
    },
    {
      icon: <FileText className="w-4 h-4 text-blue-400" />,
      title: 'Summarize this page',
      description: 'Extract and digest the key highlights of this page',
      prompt: 'Summarize the current webpage and highlight the key takeaways.',
    },
    {
      icon: <PlaySquare className="w-4 h-4 text-red-400" />,
      title: 'Play on YouTube',
      description: 'Search YouTube and start playing a requested track',
      prompt: 'Open YouTube and play a song by Arijit Singh.',
    },
    {
      icon: <FormInput className="w-4 h-4 text-emerald-400" />,
      title: 'Fill out a form',
      description: 'Detect fields on this page and preview autofill',
      prompt: 'Find the form on this page and fill it using my profile details.',
    },
    {
      icon: <Search className="w-4 h-4 text-amber-400" />,
      title: 'Search the web',
      description: 'Search Google for tutorials, research, or docs',
      prompt: 'Open Google and search for JavaScript interview questions.',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center max-w-sm mx-auto animate-fade-in">
      {/* Decorative Icon */}
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pilot-primary via-pilot-glow to-pilot-accent flex items-center justify-center shadow-xl shadow-pilot-primary/25">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-pilot-panel border-2 border-pilot-bg flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-pilot-success animate-pulse" />
        </div>
      </div>

      {/* Main Greeting */}
      <h1 className="text-xl font-bold tracking-tight text-white mb-2">
        Hey! I'm <span className="bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent">Z-Pilot</span>.
      </h1>
      <p className="text-xs text-pilot-text-secondary leading-relaxed mb-6 max-w-xs">
        Your AI browser assistant. Tell me what you want to do or pick an example below.
      </p>

      {/* Current page notification */}
      {currentPageTitle && (
        <div className="w-full mb-5 px-3 py-2 rounded-lg bg-pilot-card/80 border border-pilot-border flex items-center space-x-2 text-left">
          <Globe className="w-3.5 h-3.5 text-pilot-primary shrink-0" />
          <span className="text-[11px] text-pilot-text-muted truncate">
            Active tab: <span className="text-pilot-text-secondary font-medium">{currentPageTitle}</span>
          </span>
        </div>
      )}

      {/* Example Prompt Cards */}
      <div className="w-full space-y-2 text-left">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-pilot-text-muted px-1">
          Suggested Actions
        </div>
        {examplePrompts.map((item, index) => (
          <button
            key={index}
            onClick={() => onSelectPrompt(item.prompt)}
            className="w-full p-2.5 rounded-xl bg-pilot-card hover:bg-pilot-cardHover border border-pilot-border/70 hover:border-pilot-primary/50 transition-all duration-150 flex items-start space-x-3 group cursor-pointer text-left"
          >
            <div className="p-2 rounded-lg bg-pilot-panel border border-pilot-border/50 group-hover:border-pilot-primary/30 shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-pilot-text-primary group-hover:text-white transition-colors">
                {item.title}
              </div>
              <div className="text-[11px] text-pilot-text-muted truncate">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
