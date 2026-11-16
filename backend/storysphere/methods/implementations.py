"""Which registry methods have an implementation (id → `Method`).

registry 宣告了、但這裡沒有實作的方法，引擎回報「尚未實作」而不是當成錯誤（T13）。
"""

from __future__ import annotations

from storysphere.methods.base import Method


class MethodImplementations:
    def __init__(self) -> None:
        self._methods: dict[str, Method] = {}

    def register(self, method: Method) -> Method:
        method_id = method.decl.id
        if method_id in self._methods:
            raise ValueError(f"Method '{method_id}' is already registered")
        self._methods[method_id] = method
        return method

    def get(self, method_id: str) -> Method | None:
        return self._methods.get(method_id)

    def ids(self) -> list[str]:
        return sorted(self._methods)


def default_implementations(registry) -> MethodImplementations:
    """所有真正的方法實作；T14–T18 完成一個就在這裡註冊一個。"""
    from storysphere.methods.universal.arc import CharacterArc
    from storysphere.methods.universal.belief import CharacterBelief
    from storysphere.methods.universal.causal_network import CausalNetwork
    from storysphere.methods.universal.kernel_satellite import KernelSatellite
    from storysphere.methods.universal.network import CharacterNetwork

    impls = MethodImplementations()
    for method_id, cls in (
        ("event.causal_network", CausalNetwork),
        ("event.kernel_satellite", KernelSatellite),
        ("character.arc", CharacterArc),
        ("character.network", CharacterNetwork),
        ("character.belief", CharacterBelief),
    ):
        impls.register(cls(registry.methods[method_id]))
    return impls
