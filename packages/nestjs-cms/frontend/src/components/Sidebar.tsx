import { NavLink, ScrollArea, Text } from '@mantine/core';
import { motion } from 'framer-motion';
import type { CmsBlueprint } from '../types.js';

interface Props {
  blueprint: CmsBlueprint;
  activeModel: string | null;
  onSelect: (model: string) => void;
}

export function Sidebar({ blueprint, activeModel, onSelect }: Props) {
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
      {Object.keys(blueprint.models).map((name, i) => (
        <motion.div
          key={name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, duration: 0.2 }}
        >
          <NavLink
            label={name}
            active={activeModel === name}
            onClick={() => onSelect(name)}
            mb={2}
            style={{
              borderRadius: 6,
              fontWeight: activeModel === name ? 600 : 400,
            }}
          />
        </motion.div>
      ))}
    </ScrollArea>
  );
}
