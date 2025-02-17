import { KeymapContext, KeymapEventHandler, KeymapEventListener, Modifier } from 'obsidian'
import { Node } from './node'
import LovelyMindmap from '../main'
import autobind from 'autobind-decorator'
import { convertHotkey2Array, debounce } from '../tool'


/**
 * Register and manage your keymap
 */
@autobind
class Keymap {
  hotkeys: KeymapEventHandler[] = []
  main: LovelyMindmap
  node: Node

  constructor(main: LovelyMindmap) {
    this.main = main
    this.node = main.node
  }

  @debounce()
  async help() {
    if (this.main.view.isCreating()) return

    console.debug('this:\n', this)
    console.debug('app:\n', this.main.app)
    console.debug('canvas:\n', this.main.canvas)
    console.debug('selections:\n', this.main.canvas.selection.values().next())
  }

  nodeNavigation(_: unknown, context: KeymapContext) {
    type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
    const { key } = context as Omit<KeymapContext, 'key'> & { key: Key }

    const selection = this.node.getSingleSelection()
    if (!selection || selection.isEditing) {
      // const notice = new Notice('')
      // notice.setMessage('Press `cmd + Esc` to exit creating view')
      return
    }
    const { OFFSET_WEIGHT } = this.main.setting

    const data = this.main.canvas.getViewportNodes()


    const offsetX = (a: M.Node, b: M.Node) => Math.abs(b.x - a.x)
    const offsetY = (a: M.Node, b: M.Node) => Math.abs(b.y - a.y)
    // fixed: 复数的非整次方为 NaN
    // @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/pow#return_value:~:text=base%20%3C%200%20and%20exponent%20is%20not%20an%20integer.
    const endpointOffset = (a: M.Node, b: M.Node) => Math.min(
      Math.abs(b.y - a.y + 2 / a.height),
      Math.abs(b.y + b.height - a.y - 2 / a.height),
      Math.abs(b.x - a.x + 2 / a.width),
      Math.abs(b.x + b.width - a.x + 2 / a.width),
    )
    const calcDistance = (a: M.Node, b: M.Node) => (key === 'ArrowLeft' || key === 'ArrowRight')
      ? offsetX(a, b) + endpointOffset(a, b) ** OFFSET_WEIGHT
      : offsetY(a, b) + endpointOffset(a, b) ** OFFSET_WEIGHT
    const isSameDirection = (node: M.Node) => {
      const notSelf = node.id !== selection.id
      const strategies = {
        ArrowRight: notSelf && node.x > selection.x + selection.width,
        ArrowLeft: notSelf && node.x + node.width < selection.x,
        ArrowUp: notSelf && node.y + node.height < selection.y,
        ArrowDown: notSelf && node.y > selection.y + selection.height,
      }
      return strategies[key]
    }

    const midpoints = data
      .filter(isSameDirection)
      .map((node: M.Node) => ({
        node,
        offsetX: offsetX(selection, node),
        offsetY: offsetY(selection, node),
        endpointOffset: endpointOffset(selection, node),
        distance: calcDistance(selection, node)
      }))
      .sort((a: M.Node, b: M.Node) => a.distance - b.distance)

    if (midpoints.length > 0) {
      this.main.view.zoomToNode(midpoints[0].node)
    }
  }

  blurNode() {
    if (this.main.view.isCreating()) {
      this.main.view.creation2Navigation()
      return
    }

    if (this.main.view.isNavigating()) {
      this.main.view.useTouch()
      return
    }
  }


  focusNode() {
    if (this.main.view.isTouching()) {
      this.main.view.touch2Navigation()
      return
    }

    const navigationNode = this.main.node.getNavigationNode()
    if (!!navigationNode) {
      this.main.view.useCreation(navigationNode)
      return
    }
  }

  register(
    modifiers: any[],
    key: string | null,
    func: KeymapEventListener
  ): KeymapEventHandler {
    return this.main.app.scope.register(modifiers, key, func)
  }

  /**
   * priority: options > config > default
   * 1. options: function argument
   * 2. config: `options.hotkeys`
   * 3. default: this.register
   * @param options 
   */
  registerAll(options?: {
    [key in M.NodeActionName]?: () => KeymapEventHandler
  }) {
    const { hotkeys } = this.main.setting

    const registerHotkey = (action: M.NodeActionName, callback: KeymapEventListener) => {
      if (options?.[action]) {
        this.hotkeys.push(options[action]());
      } else {
        const [modifier, key] = convertHotkey2Array(hotkeys[action]);
        this.hotkeys.push(this.register(modifier, key, callback));
      }
    };

    registerHotkey('Focus', this.focusNode);
    registerHotkey('CreateChild', this.main.node.createChildren);
    registerHotkey('CreateBeforeSib', this.main.node.createBeforeSibNode);
    registerHotkey('CreateAfterSib', this.main.node.createAfterSibNode);
    registerHotkey('ArrowLeft', this.nodeNavigation);
    registerHotkey('ArrowRight', this.nodeNavigation);
    registerHotkey('ArrowUp', this.nodeNavigation);
    registerHotkey('ArrowDown', this.nodeNavigation);
  }

  unregisterAll() {
    this.hotkeys.forEach(key => this.main.app.scope.unregister(key))
  }
}

export { Keymap }
