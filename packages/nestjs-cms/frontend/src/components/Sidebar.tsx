import { NavLink, ScrollArea, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import type { CmsBlueprint } from '../types.js';

interface Props {
  blueprint: CmsBlueprint;
  activeModel: string | null;
  onSelect: (model: string) => void;
}

export function Sidebar({ blueprint, activeModel, onSelect }: Props) {
  const navigate = useNavigate();

  return (
    <ScrollArea flex={1} px="xs" pt="xs" pb="md">
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        px="sm"
        mb={6}
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >
        Models
      </Text>
      {Object.keys(blueprint.models)
        .sort()
        .map((name, i) => (
          <div
            key={name}
            style={{
              animation: 'fadeSlideIn 0.2s ease forwards',
              animationDelay: `${i * 0.04}s`,
              opacity: 0,
            }}
          >
            <NavLink
              label={name}
              active={activeModel === name}
              onClick={() => {
                void navigate(`/${name}`);
                onSelect(name);
              }}
              mb={2}
              style={{
                borderRadius: 6,
                fontWeight: activeModel === name ? 600 : 400,
              }}
            />
          </div>
        ))}
    </ScrollArea>
  );
}
