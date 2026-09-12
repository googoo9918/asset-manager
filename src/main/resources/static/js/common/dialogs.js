/** 브라우저 confirm/prompt를 대체한다. 편집 dialog 위에 열리며 Escape/취소는 변경 없이 종료한다. */
function askDialog(message, input = false) {
  return new Promise(resolve => {
    const dialog = $("#question-dialog"), form = $("#question-form"), previous = document.activeElement;
    $("#question-title").textContent = input ? "이름 입력" : "확인";
    $("#question-message").textContent = message;
    $("#question-label").hidden = !input;
    $("#question-input").value = "";
    $("#question-input").required = input;
    let result = input ? null : false;
    form.onsubmit = e => { e.preventDefault(); result = input ? $("#question-input").value.trim() : true; dialog.close(); };
    $("#question-cancel").onclick = () => dialog.close();
    dialog.onclose = () => { form.onsubmit = null; dialog.onclose = null; previous?.focus(); resolve(result); };
    dialog.showModal();
    (input ? $("#question-input") : $("#question-cancel")).focus();
  });
}
const uiConfirm = message => askDialog(message);
const uiPrompt = message => askDialog(message, true);
