-- Stream Deck action: sleep the displays without putting the Mac to sleep.

local helpers = require("streamdeck.helpers")
local running_by_instance = {}

return {
  id = "com.brettinternet.hammerspoon.sleep-displays",
  name = "Sleep displays",
  description = "Sleep the displays without putting the Mac to sleep.",
  category = "System",
  gesture = "Press: sleep the displays",

  appearance = function(_context)
    return {
      title = "Sleep\ndisplays",
      state = "inactive",
      appearanceVersion = 1,
      icon = helpers.icon("display", { foregroundColor = helpers.colors.accent }),
    }
  end,

  press = function(context)
    if type(hs) ~= "table" or type(hs.task) ~= "table" or type(hs.task.new) ~= "function" then
      error("display sleep task API unavailable")
    end
    local instance_id = context.instanceId
    if running_by_instance[instance_id] ~= nil then
      error("display sleep is already running")
    end

    local created, task = pcall(hs.task.new, "/usr/bin/pmset", function(exit_code)
      running_by_instance[instance_id] = nil
      if exit_code == 0 then
        context:success("Displays\nasleep", 850)
      else
        context:error("Sleep failed\n(exit " .. tostring(exit_code) .. ")", 1200)
      end
      context:refresh()
    end, function()
      return true
    end, { "displaysleepnow" })
    if not created or task == nil then
      error("failed to create display sleep task")
    end

    running_by_instance[instance_id] = task
    local started, result = pcall(task.start, task)
    if not started or result == false or result == nil then
      running_by_instance[instance_id] = nil
      error("failed to start display sleep task")
    end
  end,
}
