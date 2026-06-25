import { Switch as ChakraSwitch } from '@chakra-ui/react'

export type SwitchProps = ChakraSwitch.RootProps

export function Switch(props: SwitchProps) {
  return (
    <ChakraSwitch.Root {...props}>
      <ChakraSwitch.HiddenInput />
      <ChakraSwitch.Control>
        <ChakraSwitch.Thumb />
      </ChakraSwitch.Control>
    </ChakraSwitch.Root>
  )
}
