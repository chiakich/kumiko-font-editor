import { Box, Tabs } from '@chakra-ui/react'
import { LayoutGroup, motion } from 'framer-motion'
import type { ComponentProps, ReactNode } from 'react'

const tabHighlightTransition = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.8,
} as const

type SlidingTabsRootProps = ComponentProps<typeof Tabs.Root>
type SlidingTabsContentGroupProps = ComponentProps<typeof Tabs.ContentGroup>
type SlidingTabsListProps = Omit<ComponentProps<typeof Tabs.List>, 'children'>

interface SlidingTabProps {
  children: ReactNode
  isSelected: boolean
  layoutId: string
  value: string
}

function SlidingTab({
  children,
  isSelected,
  layoutId,
  value,
}: SlidingTabProps) {
  return (
    <Tabs.Trigger
      value={value}
      className="corner-round"
      alignItems="center"
      border={0}
      borderRadius="full"
      color={isSelected ? 'var(--sliding-tab-active-color)' : 'foreground'}
      cursor="pointer"
      display="inline-flex"
      flexShrink={0}
      fontWeight="600"
      h={7}
      justifyContent="center"
      letterSpacing="wide"
      lineHeight={1}
      minW={0}
      overflow="visible"
      px={3.5}
      position="relative"
      transition="color 160ms ease"
      whiteSpace="nowrap"
      _active={{
        bg: 'transparent',
      }}
      _focusVisible={{
        boxShadow: '0 0 0 2px var(--chakra-colors-cyan-400)',
      }}
      _hover={{
        bg: 'transparent',
        color: isSelected ? 'var(--sliding-tab-active-color)' : 'foreground',
      }}
      _selected={{
        bg: 'transparent',
        color: 'var(--sliding-tab-active-color)',
      }}
    >
      {isSelected ? (
        <motion.span
          layoutId={layoutId}
          className="corner-round"
          transition={tabHighlightTransition}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 9999,
            background: 'var(--sliding-tab-active-bg)',
            boxShadow: '0 1px 2px rgba(8, 11, 13, 0.16)',
          }}
        />
      ) : null}
      <Box
        as="span"
        alignItems="center"
        display="inline-flex"
        h="100%"
        justifyContent="center"
        lineHeight={1}
        position="relative"
        zIndex={1}
      >
        {children}
      </Box>
    </Tabs.Trigger>
  )
}

interface SlidingTabListProps extends SlidingTabsListProps {
  activeIndex: number
  labels: ReactNode[]
  layoutGroupId: string
}

export function SlidingTabsRoot({
  lazyMount = true,
  unstyled = true,
  ...props
}: SlidingTabsRootProps) {
  return <Tabs.Root lazyMount={lazyMount} unstyled={unstyled} {...props} />
}

export function SlidingTabsContentGroup({
  mt = 3,
  ...props
}: SlidingTabsContentGroupProps) {
  return <Tabs.ContentGroup mt={mt} {...props} />
}

export function SlidingTabList({
  activeIndex,
  labels,
  layoutGroupId,
  ...listProps
}: SlidingTabListProps) {
  return (
    <LayoutGroup id={layoutGroupId}>
      <Tabs.List
        className="corner-round"
        alignItems="center"
        bg="muted"
        borderRadius="full"
        display="inline-flex"
        gap={1}
        maxW="100%"
        minH={9}
        overflowX="auto"
        overflowY="hidden"
        p={1}
        css={{
          '--sliding-tab-active-bg': 'var(--chakra-colors-primary)',
          '--sliding-tab-active-color':
            'var(--chakra-colors-primaryForeground)',
        }}
        _dark={{
          '--sliding-tab-active-bg': 'var(--chakra-colors-black)',
          '--sliding-tab-active-color': 'var(--chakra-colors-yellow-300)',
        }}
        {...listProps}
      >
        {labels.map((label, index) => (
          <SlidingTab
            key={`${layoutGroupId}-${index}`}
            isSelected={activeIndex === index}
            layoutId={`${layoutGroupId}-active-tab`}
            value={String(index)}
          >
            {label}
          </SlidingTab>
        ))}
      </Tabs.List>
    </LayoutGroup>
  )
}
