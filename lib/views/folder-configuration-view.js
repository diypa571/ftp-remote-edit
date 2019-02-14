'use babel';

import ConfigurationView from './../views/configuration-view';
import { $, View, TextEditorView } from 'atom-space-pen-views';
import { TextBuffer, CompositeDisposable } from 'atom';
import { cleanJsonString } from './../helper/format.js';
import { throwErrorIssue44 } from './../helper/issue.js';
import { decrypt, encrypt } from './../helper/secure.js';
import { showMessage } from './../helper/helper.js';
import Connector from './../connectors/connector.js';

const atom = global.atom;
const config = require('./../config/folder-schema.json');
const Storage = require('./../helper/storage.js');

export default class FolderConfigurationView extends View {

  static content() {
    return this.div({
      class: 'ftp-remote-edit settings-view overlay from-top'
    }, () => {
      this.div({
        class: 'panels',
      }, () => {
        this.div({
          class: 'panels-item',
        }, () => {
          this.label({
            class: 'icon',
            outlet: 'info',
          });
          this.div({
            class: 'panels-content',
            outlet: 'content',
          });
          this.div({
            class: 'panels-footer',
            outlet: 'footer',
          });
        });
      });
      this.div({
        class: 'error-message',
        outlet: 'error',
      });
    });
  }

  initialize() {
    const self = this;

    self.subscriptions = null;
    self.password = null;
    self.disableEventhandler = false;

    let html = '<p>Ftp-Remote-Edit Folder Settings</p>';
    html += "<p>You can edit each folder at the time. All changes will only be saved by pushing the save button.</p>";
    self.info.html(html);

    let saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.classList.add('btn');

    let closeButton = document.createElement('button');
    closeButton.textContent = 'Cancel';
    closeButton.classList.add('btn');
    closeButton.classList.add('pull-right');

    self.content.append(self.createFolderSelect());
    self.content.append(self.createControls());

    self.footer.append(saveButton);
    self.footer.append(closeButton);

    // Events
    closeButton.addEventListener('click', (event) => {
      self.close();
    });

    saveButton.addEventListener('click', (event) => {
      self.save();
      self.close();
    });

    self.subscriptions = new CompositeDisposable();
    self.subscriptions.add(atom.commands.add(this.element, {
      'core:confirm': () => {
        // self.save();
      },
      'core:cancel': () => {
        self.cancel();
      },
    }));
  }

  destroy() {
    const self = this;

    if (self.subscriptions) {
      self.subscriptions.dispose();
      self.subscriptions = null;
    }
  }

  createControls() {
    const self = this;

    let nameLabel = document.createElement('label');
    nameLabel.classList.add('control-label');
    let nameLabelTitle = document.createElement('div');
    nameLabelTitle.textContent = 'The name of the folder.';
    nameLabelTitle.classList.add('setting-title');
    nameLabel.appendChild(nameLabelTitle);
    self.nameInput = new TextEditorView({ mini: true, placeholderText: "name" });
    self.nameInput.element.classList.add('form-control');

    let parentLabel = document.createElement('label');
    parentLabel.classList.add('control-label');
    let parentLabelTitle = document.createElement('div');
    parentLabelTitle.textContent = 'Choose parent folder';
    parentLabelTitle.classList.add('setting-title');
    parentLabel.appendChild(parentLabelTitle);

    self.parentSelect = document.createElement('select');
    self.parentSelect.classList.add('form-control');

    let option = document.createElement("option");
    option.text = '- None -';
    option.value = null;
    self.parentSelect.add(option);

    Storage.getFolders().forEach((config) => {
        let folder_option = document.createElement("option");
        folder_option.text = config.name;
        folder_option.value = config.id;
        self.parentSelect.add(folder_option);
    });

    let parentSelectContainer = document.createElement('div');
    parentSelectContainer.classList.add('select-container');
    parentSelectContainer.appendChild(self.parentSelect);

    // Events
    self.nameInput.getModel().onDidChange(() => {
      if (Storage.getFolders().length !== 0 && !self.disableEventhandler) {
        let index = self.selectFolder.selectedOptions[0].value;
        let folder = Storage.getFolder(index);
        folder.name = self.nameInput.getText().trim();
        self.selectFolder.selectedOptions[0].text = self.nameInput.getText().trim();
      }
    });

    self.parentSelect.addEventListener('change', (event) => {
      if (Storage.getFolders().length !== 0 && !self.disableEventhandler) {
        let index = self.selectFolder.selectedOptions[0].value;
        let option = event.currentTarget.selectedOptions[0].value;
        let folder = Storage.getFolder(index);
        folder.parent = parseInt(option);
      }
    });

    let divRequired = document.createElement('div');
    divRequired.classList.add('server-settings');

    let nameControl = document.createElement('div');
    nameControl.classList.add('controls');
    nameControl.classList.add('name');
    nameControl.appendChild(nameLabel);
    nameControl.appendChild(self.nameInput.element);

    let parentControl = document.createElement('div');
    parentControl.classList.add('controls');
    parentControl.classList.add('folder');
    parentControl.appendChild(parentLabel);
    parentControl.appendChild(parentSelectContainer);

    divRequired.appendChild(parentControl);
    divRequired.appendChild(nameControl);

    return divRequired;
  }

  createFolderSelect() {
    const self = this;

    let div = document.createElement('div');
    div.style.marginBottom = '20px';

    let selectContainer = document.createElement('div');
    selectContainer.classList.add('select-container');

    let select = document.createElement('select');
    select.classList.add('form-control');
    selectContainer.appendChild(select);
    self.selectFolder = select;
    self.selectFolder.focus();

    let newButton = document.createElement('button');
    newButton.textContent = 'New';
    newButton.classList.add('btn');

    self.deleteButton = document.createElement('button');
    self.deleteButton.textContent = 'Delete';
    self.deleteButton.classList.add('btn');
    self.deleteButton.classList.add('pull-right');


    div.appendChild(selectContainer);
    selectContainer.appendChild(newButton);
    selectContainer.appendChild(self.deleteButton);

    // Events
    select.addEventListener('change', (event) => {
      if (Storage.getFolders().length !== 0 && !self.disableEventhandler) {
        let option = event.currentTarget.selectedOptions[0];
        let index = self.selectFolder.selectedOptions[0].value;
        let folder = Storage.getFolder(index);

        self.fillInputFields((index) ? folder : null);
      }
    });

    newButton.addEventListener('click', (event) => {
      self.new();
    });

    self.deleteButton.addEventListener('click', (event) => {
      self.delete();
    });

    div.classList.add('server');

    return div;
  }


  reload(selectedFolder) {
    const self = this;

    self.disableEventhandler = true;

    if (self.selectFolder.options.length > 0) {
      for (i = self.selectFolder.options.length - 1; i >= 0; i--) {
        self.selectFolder.remove(i);
      }
    }

    let selectedIndex = 0;
    if (Storage.getFolders().length !== 0) {
      Storage.getFolders().forEach((item, index) => {
        let option = document.createElement("option");
        option.text = item.name;
        option.value = item.id;
        self.selectFolder.add(option);
      });

      if(typeof selectedFolder === 'undefined') {
          selectFolder = Storage.getFolders()[0];
      } else {
          this.selectFolder.value = selectedFolder.id;
          this.selectFolder.dispatchEvent(new Event('change'));
          self.fillInputFields(selectedFolder);
      }

      // Enable Input Fields
      self.enableInputFields();
    } else {
      self.fillInputFields();

      // Disable Input Fields
      self.disableInputFields();
    }
    self.disableEventhandler = false;
  }

  attach() {
    const self = this;

    self.panel = atom.workspace.addModalPanel({
      item: self
    });

    // Resize content to fit on smaller displays
    let body = document.body.offsetHeight;
    let content = self.panel.element.offsetHeight;
    let offset = $(self.panel.element).position().top;

    if (content + (2 * offset) > body) {
      let settings = self.content.find('.server-settings')[0];
      let height = (2 * offset) + content - body;
      $(settings).height($(settings).height() - height);
    }
  }

  close() {
    const self = this;

    const destroyPanel = this.panel;
    this.panel = null;
    if (destroyPanel) {
      destroyPanel.destroy();
    }

    self.configurationView = new ConfigurationView();

    self.configurationView.reload(null);
    self.configurationView.attach();
  }

  cancel() {
    this.close();
  }

  showError(message) {
    this.error.text(message);
    if (message) {
      this.flashError();
    }
  }

  fillInputFields(folder = null) {
    const self = this;

    self.disableEventhandler = true;

    if (folder != null) {
      self.nameInput.setText(folder.name);
      self.parentSelect.selectedIndex = folder.parent;
      for (i = self.parentSelect.options.length - 1; i >= 0; i--) {
        self.parentSelect.options[i].disabled = self.parentSelect.options[i].hidden = (self.parentSelect.options[i].value == folder.id);
      }

    } else {
      self.nameInput.setText('');
      self.parentSelect.selectedIndex = 0;
    }

    self.disableEventhandler = false;
  }

  enableInputFields() {
    const self = this;

    self.deleteButton.classList.remove('disabled');
    self.deleteButton.disabled = false;

    self.nameInput[0].classList.remove('disabled');
    self.nameInput.disabled = false;

    self.parentSelect.classList.remove('disabled');
    self.parentSelect.disabled = false;
  }

  disableInputFields() {
    const self = this;

    self.deleteButton.classList.add('disabled');
    self.deleteButton.disabled = true;

    self.nameInput[0].classList.add('disabled');
    self.nameInput.disabled = true;

    self.parentSelect.classList.add('disabled');
    self.parentSelect.disabled = true;

    let changing = false;
    self.nameInput.getModel().onDidChange(() => {
      if (!changing && self.nameInput.disabled) {
        changing = true;
        self.nameInput.setText('');
        changing = false;
      }
    });
  }

  new() {
    const self = this;

    self.enableInputFields();

    let newconfig = JSON.parse(JSON.stringify(config));
    newconfig.name = config.name + " " + (Storage.getFolders().length + 1);
    newconfig = Storage.addFolder(newconfig);

    let option = document.createElement('option');
    option.text = newconfig.name;
    option.value = newconfig.id;

    self.selectFolder.add(option);
    self.selectFolder.dispatchEvent(new Event('change'));
    self.parentSelect.add(option);
    self.parentSelect.dispatchEvent(new Event('change'));

    self.reload(newconfig);
  }

  save() {
    const self = this;

    Storage.save();
    self.close();
  }

  delete() {
    const self = this;

    if (Storage.getFolders().length != 0) {
        let index = self.selectFolder.selectedOptions[0].value;
        Storage.deleteFolder(index);
    }

    self.reload();
  }

}