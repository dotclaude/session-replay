import React from 'react';
import HumanTurn from './HumanTurn.jsx';
import AssistantText from './AssistantText.jsx';
import ToolBash from './ToolBash.jsx';
import ToolWrite from './ToolWrite.jsx';
import ToolEdit from './ToolEdit.jsx';
import ToolRead from './ToolRead.jsx';
import ToolAgent from './ToolAgent.jsx';
import ToolWeb from './ToolWeb.jsx';
import ToolTask from './ToolTask.jsx';
import ToolSkill from './ToolSkill.jsx';
import ToolGeneric from './ToolGeneric.jsx';
import TurnSummary from './TurnSummary.jsx';
import PRBadge from './PRBadge.jsx';
import SessionHeader from './SessionHeader.jsx';
import HookEvent from './HookEvent.jsx';
import CompactionEvent from './CompactionEvent.jsx';
import AgentProgress from './AgentProgress.jsx';
import ErrorEvent from './ErrorEvent.jsx';
import LocalCommand from './LocalCommand.jsx';

export default function StageRenderer({ step, isCurrent, isSearchMatch = false }) {
  const props = { step, isCurrent, isSearchMatch };

  switch (step.kind) {
    case 'session-header':    return <SessionHeader {...props} />;
    case 'human':             return <HumanTurn {...props} />;
    case 'assistant-text':    return <AssistantText {...props} />;
    case 'tool-bash':         return <ToolBash {...props} />;
    case 'tool-write':        return <ToolWrite {...props} />;
    case 'tool-edit':         return <ToolEdit {...props} />;
    case 'tool-read':         return <ToolRead {...props} />;
    case 'tool-agent':        return <ToolAgent {...props} />;
    case 'tool-web':          return <ToolWeb {...props} />;
    case 'tool-task':         return <ToolTask {...props} />;
    case 'tool-skill':        return <ToolSkill {...props} />;
    case 'tool-generic':      return <ToolGeneric {...props} />;
    case 'turn-summary':      return <TurnSummary {...props} />;
    case 'pr-link':           return <PRBadge {...props} />;
    case 'hook-event':        return <HookEvent {...props} />;
    case 'compaction-event':     return <CompactionEvent {...props} />;
    case 'agent-progress':       return <AgentProgress {...props} />;
    case 'error-event':          return <ErrorEvent {...props} />;
    case 'local-command':        return <LocalCommand {...props} />;
    case 'local-command-output': return null; // Now attached to parent command
    case 'queue-op':             return null; // used by StatsPanel only
    default:                     return null;
  }
}
